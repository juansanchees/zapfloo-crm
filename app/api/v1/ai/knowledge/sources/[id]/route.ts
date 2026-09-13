/**
 * PATCH  /api/v1/ai/knowledge/sources/[id]  — update knowledge source
 * DELETE /api/v1/ai/knowledge/sources/[id]  — soft-delete (status='archived')
 *
 * Auth: cookie session. Role >= manager required.
 * organization_id is ALWAYS resolved from the authenticated session — never from body/path.
 */

import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  aceitaTextoColado,
  canonizarTipoDeFonte,
  ePerguntaEResposta,
} from "@/lib/ai/rag/tipos-de-fonte";
import { lerEstadoDoSite, revisaoDoSiteExpirou } from "@/lib/onboarding/site/estado";
import { hashPerguntasDoSite } from "@/lib/onboarding/site/faq-confirmada";
import { audit } from "@/lib/audit";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Zod schema for PATCH
// ---------------------------------------------------------------------------

const faqItemSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  tags: z.array(z.string()).optional().default([]),
  locale: z.string().optional().default("pt-BR"),
});

const patchSourceSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  items: z.array(faqItemSchema).optional(),
  source_metadata: z.record(z.string(), z.unknown()).optional(),
  confirmar_site: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Shared: resolve auth + role gate
// ---------------------------------------------------------------------------

async function resolveContext(requestId: string) {
  const authz = await requireRole("manager", { requestId, resource: "ai_knowledge" });
  if (!authz.ok) return { error: authz.response };
  return { authUser: authz.user, activeOrg: authz.org };
}

// ---------------------------------------------------------------------------
// GET — o material e o conteúdo que dá para editar
// ---------------------------------------------------------------------------
//
// Existe para o diálogo de edição não ter de adivinhar o que já está lá. Sem
// ele, "Editar conteúdo" abriria um campo vazio e salvar apagaria a FAQ inteira
// — o pior desfecho possível para um botão chamado "editar".

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: sourceId } = await params;

  const ctx = await resolveContext(requestId);
  if (ctx.error) return ctx.error;
  const { activeOrg } = ctx as Exclude<typeof ctx, { error: Response }>;

  const supabase = await createClient();
  const { data: fonte, error } = await supabase
    .from("ai_knowledge_sources")
    .select(
      "id, agent_id, organization_id, source_type, name, status, last_index_status, " +
        "last_index_error, last_indexed_at, chunks_count, is_active, source_metadata, " +
        "active_kb_version_id, created_at, updated_at",
    )
    .eq("id", sourceId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();

  if (error) {
    console.error("[ai-knowledge-sources] GET falhou:", error.message);
    return fail("internal_error", "Erro ao ler o material.", 500, { requestId });
  }
  if (!fonte) {
    return fail("not_found", "Material não encontrado.", 404, { requestId });
  }

  const { data: itens, error: itensErr } = await supabase
    .from("ai_faq_items")
    .select("question, answer, tags, locale, position")
    .eq("organization_id", activeOrg.orgId)
    .eq("knowledge_source_id", sourceId)
    .order("position", { ascending: true });

  // Falha de leitura NÃO é FAQ vazia: o editor substituiria o conteúdo que
  // deixou de receber. Sem a resposta inteira, salvar deve permanecer bloqueado.
  if (itensErr) {
    return fail("internal_error", "Erro ao ler o material.", 500, { requestId });
  }

  return ok(
    { ...(fonte as unknown as Record<string, unknown>), items: itens ?? [] },
    { requestId },
  );
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: sourceId } = await params;

  const ctx = await resolveContext(requestId);
  if (ctx.error) return ctx.error;
  const { activeOrg, authUser } = ctx as Exclude<typeof ctx, { error: Response }>;
  const t = (texto: string) => traduzir(texto, authUser.idioma);

  // Parse + validate body.
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("invalid_request", "Body JSON inválido.", 400, { requestId });
  }

  const parsed = patchSourceSchema.safeParse(rawBody);
  if (!parsed.success) {
    return fail("validation_failed", "Campos inválidos.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const input = parsed.data;

  // Verify the source exists and belongs to the org (user-scoped client for RLS check).
  const supabase = await createClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("ai_knowledge_sources")
    .select("id, source_type, agent_id, source_metadata, status, is_active")
    .eq("id", sourceId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[ai-knowledge-sources] PATCH fetch failed:", fetchErr.message);
    return fail("internal_error", "Erro ao verificar fonte.", 500, { requestId });
  }
  if (!existing) {
    return fail("not_found", "Fonte de conhecimento não encontrada.", 404, { requestId });
  }

  const ksRow = existing as {
    id: string;
    source_type: string;
    agent_id: string | null;
    source_metadata: Record<string, unknown>;
    status: string;
    is_active: boolean;
  };
  const tipo = canonizarTipoDeFonte(ksRow.source_type);
  const estadoSite = tipo === "site" ? lerEstadoDoSite(ksRow.source_metadata) : null;

  // Carimbos de leitura/revisão só têm escritor específico. O PATCH genérico
  // não pode fabricar a aprovação que o worker usa como fronteira de publicação.
  if (tipo === "site" && input.source_metadata !== undefined) {
    return fail(
      "unprocessable_entity",
      t(
        "O estado da leitura é atualizado pelo sistema. Revise as perguntas para confirmar o material.",
      ),
      422,
      { requestId },
    );
  }
  if (input.confirmar_site && (tipo !== "site" || !input.items?.length)) {
    return fail("validation_failed", t("Revise as perguntas do site antes de confirmar."), 422, {
      requestId,
    });
  }
  if (
    tipo === "site" &&
    input.items !== undefined &&
    (!estadoSite?.concluidaEm ||
      (ksRow.status === "building" && !revisaoDoSiteExpirou(estadoSite)) ||
      ksRow.status === "archived")
  ) {
    return fail("conflict", t("Aguarde a leitura terminar antes de revisar as perguntas."), 409, {
      requestId,
    });
  }
  if (input.items !== undefined && tipo !== null && !aceitaTextoColado(tipo)) {
    return fail(
      "unprocessable_entity",
      "Este material não é preenchido por texto colado — envie o arquivo ou aguarde a rotina que o alimenta.",
      422,
      { requestId },
    );
  }

  // Build update payload (only provided fields).
  const updatePayload: Record<string, unknown> = {};
  if (input.name !== undefined) updatePayload.name = input.name;
  if (input.source_metadata !== undefined) updatePayload.source_metadata = input.source_metadata;
  if (tipo === "site" && input.items !== undefined) {
    // Uma falha ao substituir perguntas deixa rascunho, nunca material parcial
    // utilizável pela IA. A aprovação só acontece depois da gravação inteira.
    updatePayload.is_active = false;
  }

  const admin = createAdminClient();
  let metadataReservada: Record<string, unknown> | null = null;
  let siteSemRevisao = estadoSite;
  if (tipo === "site" && input.items !== undefined && estadoSite) {
    const {
      revisadoEm: _em,
      revisadoPor: _por,
      revisaoConteudoHash: _hash,
      revisaoToken: _token,
      revisaoInicio: _inicio,
      ...semRevisao
    } = estadoSite;
    siteSemRevisao = semRevisao;
    metadataReservada = {
      ...ksRow.source_metadata,
      site: {
        ...semRevisao,
        revisaoToken: randomUUID(),
        revisaoInicio: new Date().toISOString(),
      },
    };
    // CAS: duas abas que leram o mesmo rascunho não podem substituir seus
    // itens simultaneamente. Cada término também precisa provar posse.
    const { data: reserva, error: reservaErr } = await admin
      .from("ai_knowledge_sources")
      .update({
        ...updatePayload,
        status: "building",
        is_active: false,
        source_metadata: metadataReservada,
      })
      .eq("id", sourceId)
      .eq("organization_id", activeOrg.orgId)
      .eq("status", ksRow.status)
      .eq("source_metadata", JSON.stringify(ksRow.source_metadata))
      .select("id")
      .maybeSingle();
    if (reservaErr)
      return fail(
        "internal_error",
        t("Não consegui reservar o material para revisão. Tente novamente."),
        500,
        { requestId },
      );
    if (!reserva)
      return fail(
        "conflict",
        t("Este material mudou em outra aba. Abra a revisão novamente."),
        409,
        { requestId },
      );
  }

  async function cancelarReserva(): Promise<void> {
    if (!metadataReservada || !siteSemRevisao) return;
    await admin
      .from("ai_knowledge_sources")
      .update({
        status: "ready",
        is_active: false,
        last_index_status: "failed",
        last_index_error: "site_revisao_gravacao_incompleta",
        source_metadata: { ...ksRow.source_metadata, site: siteSemRevisao },
      })
      .eq("id", sourceId)
      .eq("organization_id", activeOrg.orgId)
      .eq("status", "building")
      .eq("source_metadata", JSON.stringify(metadataReservada));
  }

  if (!metadataReservada && Object.keys(updatePayload).length > 0) {
    const { error: updateErr } = await admin
      .from("ai_knowledge_sources")
      .update(updatePayload)
      .eq("id", sourceId)
      .eq("organization_id", activeOrg.orgId);

    if (updateErr) {
      console.error("[ai-knowledge-sources] PATCH update failed:", updateErr.message);
      return fail("internal_error", "Erro ao atualizar fonte.", 500, { requestId });
    }
  }

  // Replace FAQ items if provided.
  let itemsCount: number | undefined;
  if (input.items !== undefined && tipo !== null && ePerguntaEResposta(tipo)) {
    // Delete existing items.
    const { error: delErr } = await admin
      .from("ai_faq_items")
      .delete()
      .eq("knowledge_source_id", sourceId)
      .eq("organization_id", activeOrg.orgId);

    if (delErr) {
      await cancelarReserva();
      console.error("[ai-knowledge-sources] PATCH delete items failed:", delErr.message);
      return fail("internal_error", "Erro ao remover itens antigos.", 500, { requestId });
    }

    if (input.items.length > 0) {
      const rows = input.items.map((item, idx) => ({
        organization_id: activeOrg.orgId,
        knowledge_source_id: sourceId,
        question: item.question,
        answer: item.answer,
        tags: item.tags,
        locale: item.locale,
        position: idx,
      }));

      const { error: insertErr } = await admin.from("ai_faq_items").insert(rows);

      if (insertErr) {
        await cancelarReserva();
        console.error("[ai-knowledge-sources] PATCH insert items failed:", insertErr.message);
        return fail("internal_error", "Erro ao inserir novos itens FAQ.", 500, { requestId });
      }
      itemsCount = rows.length;
    } else {
      itemsCount = 0;
    }
  }

  if (tipo === "site" && input.items !== undefined && siteSemRevisao && metadataReservada) {
    const site = input.confirmar_site
      ? {
          ...siteSemRevisao,
          perguntas: itemsCount ?? 0,
          revisadoEm: new Date().toISOString(),
          revisadoPor: authUser.id,
          revisaoConteudoHash: hashPerguntasDoSite(input.items),
        }
      : { ...siteSemRevisao, perguntas: itemsCount ?? 0 };
    const { data: revisao, error: revisaoErr } = await admin
      .from("ai_knowledge_sources")
      .update({
        status: "ready",
        source_metadata: { ...ksRow.source_metadata, site },
        is_active: input.confirmar_site === true,
      })
      .eq("id", sourceId)
      .eq("organization_id", activeOrg.orgId)
      .eq("status", "building")
      .eq("source_metadata", JSON.stringify(metadataReservada))
      .select("id")
      .maybeSingle();
    if (revisaoErr) {
      await cancelarReserva();
      return fail(
        "internal_error",
        t("Não consegui confirmar as perguntas. O material continua sem uso pelo agente."),
        500,
        { requestId },
      );
    }
    if (!revisao)
      return fail(
        "conflict",
        t("Este material mudou em outra aba. Abra a revisão novamente."),
        409,
        { requestId },
      );
  }

  // Emit knowledge_source.updated (fire-and-forget).
  const { error: emitErr } = await admin.rpc(
    "emit_event" as never,
    {
      p_event_type: "knowledge_source.updated",
      p_entity_kind: "ai_knowledge_source",
      p_entity_id: sourceId,
      p_payload: {
        knowledge_source_id: sourceId,
        agent_id: ksRow.agent_id,
        source_type: ksRow.source_type,
      },
      p_organization_id: activeOrg.orgId,
    } as never,
  );

  if (emitErr) {
    console.warn("[ai-knowledge-sources] emit_event failed (non-blocking):", emitErr.message);
  }

  await audit({
    organizationId: activeOrg.orgId,
    actorUserId: authUser.id,
    action: "knowledge_source.updated",
    resourceType: "ai_knowledge_sources",
    resourceId: sourceId,
    requestId,
    metadata: { source_type: ksRow.source_type, site_confirmado: input.confirmar_site === true },
  });

  return ok(
    { id: sourceId, ...(itemsCount !== undefined ? { items_count: itemsCount } : {}) },
    { requestId },
  );
}

// ---------------------------------------------------------------------------
// DELETE — soft-delete (status='archived')
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: sourceId } = await params;

  const ctx = await resolveContext(requestId);
  if (ctx.error) return ctx.error;
  const { activeOrg } = ctx as Exclude<typeof ctx, { error: Response }>;

  // Verify ownership with user-scoped client.
  const supabase = await createClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("ai_knowledge_sources")
    .select("id")
    .eq("id", sourceId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[ai-knowledge-sources] DELETE fetch failed:", fetchErr.message);
    return fail("internal_error", "Erro ao verificar fonte.", 500, { requestId });
  }
  if (!existing) {
    return fail("not_found", "Fonte de conhecimento não encontrada.", 404, { requestId });
  }

  const admin = createAdminClient();
  // `is_active` JUNTO, e não só `status`.
  //
  // Nenhuma linha do repo jamais escreveu `is_active = false`. Enquanto existia
  // o índice único `(agent_id, source_type) WHERE is_active`, isso deixava o
  // "slot" ocupado por um material arquivado PARA SEMPRE: recriar devolvia 409 e
  // não havia caminho nenhum de volta. O índice saiu na 0181 e a incoerência
  // dos dois campos sairia junto — a constraint
  // `ai_knowledge_sources_arquivada_nao_e_ativa` agora recusa arquivar pela metade.
  const { error: archiveErr } = await admin
    .from("ai_knowledge_sources")
    .update({ status: "archived", is_active: false })
    .eq("id", sourceId)
    .eq("organization_id", activeOrg.orgId);

  if (archiveErr) {
    console.error("[ai-knowledge-sources] arquivar falhou:", archiveErr.message);
    return fail("internal_error", "Erro ao arquivar o material.", 500, { requestId });
  }

  return ok({ id: sourceId, status: "archived" }, { requestId });
}
