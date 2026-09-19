/**
 * GET /api/v1/pipelines/[id]/board
 *
 * Returns the full board snapshot for the Kanban: pipeline metadata + active
 * stages (ordered by position) + open leads (excluding archived). All RLS-
 * filtered to the caller's org via cookie session.
 *
 * Why this exists: previously useBoard hit supabase-js directly from the
 * browser. The auth cookie is httpOnly, which the browser Supabase client
 * cannot read — auth.uid() came back null and RLS dropped the pipeline row,
 * surfacing as PostgREST "Cannot coerce result to a single JSON object"
 * (PGRST116). Routing through the API ensures the server-side cookie reader
 * runs, same as every other authed query.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
import {
  roteiaProximasAcoes,
  type EstadoDoContato,
  type PropostaAmbigua,
} from "@/lib/leads/next-action";
import type { LeadCandidate } from "@/lib/leads/active-lead";
import { createClient } from "@/lib/supabase/server";
import type { BoardData, Pipeline, Stage } from "@/lib/kanban/types";
import { calculateBoardSummary } from "@/lib/kanban/summary";
import type { Lead } from "@/lib/types/leads";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

// PostgREST limita respostas a 1.000 linhas por padrão. O board é um snapshot:
// parar na primeira página faria os cards, contadores e totais mentirem juntos.
const BOARD_PAGE_SIZE = 1_000;
// Menor que max_rows: `.in` nunca aproxima uma resposta truncada silenciosa.
const IN_CHUNK_SIZE = 500;

function chunks<T>(values: T[], size = IN_CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function loadAllBoardLeads(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  pipelineId: string,
): Promise<{ leads: Lead[]; error: string | null }> {
  const leads: Lead[] = [];
  for (let offset = 0; ; offset += BOARD_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("crm_leads")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("pipeline_id", pipelineId)
      .neq("status", "archived")
      // A segunda chave torna a paginação determinística para cards empatados.
      .order("position_in_stage")
      .order("id")
      .range(offset, offset + BOARD_PAGE_SIZE - 1);
    if (error) return { leads, error: error.message };
    const page = (data ?? []) as Lead[];
    leads.push(...page);
    if (page.length < BOARD_PAGE_SIZE) return { leads, error: null };
  }
}

/**
 * Anexa a identidade do agente dono (nome + versão publicada) aos leads que têm
 * `owner_kind='ai'`.
 *
 * **Sem filtro de `is_active`/`archived_at` de propósito.** Quem é o dono é
 * pergunta de EXIBIÇÃO e vale para qualquer agente: desativar um bot não pode
 * transformar os negócios dele em cards anônimos. A lista de agentes que PODEM
 * receber um lead (o picker, `/api/v1/ai/agents/assignable`) é outra pergunta e
 * lá os filtros estão certos.
 *
 * `organization_id` é filtrado explicitamente — vem do pipeline já validado pela
 * RLS do caller, nunca do body.
 */
async function withOwnerAgents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  leads: Lead[],
): Promise<{ leads: Lead[]; error: string | null }> {
  const agentIds = [
    ...new Set(
      leads
        .filter((l) => l.owner_kind === "ai" && l.owner_agent_id)
        .map((l) => l.owner_agent_id as string),
    ),
  ];
  if (agentIds.length === 0) return { leads, error: null };

  const agentRows: Array<{
    id: string;
    name: string;
    published_version_id: string | null;
  }> = [];
  for (const ids of chunks(agentIds)) {
    const { data, error } = await supabase
      .from("ai_agents")
      .select("id, name, published_version_id")
      .eq("organization_id", organizationId)
      .in("id", ids);
    if (error) return { leads, error: error.message };
    agentRows.push(...((data ?? []) as typeof agentRows));
  }

  const publishedIds = agentRows
    .map((a) => a.published_version_id)
    .filter((v): v is string => !!v);
  const versionById = new Map<string, number>();
  if (publishedIds.length > 0) {
    for (const ids of chunks(publishedIds)) {
      const { data: versions, error } = await supabase
        .from("ai_agent_versions")
        .select("id, version_number")
        .eq("organization_id", organizationId)
        .in("id", ids);
      if (error) return { leads, error: error.message };
      for (const v of (versions ?? []) as Array<{ id: string; version_number: number }>) {
        versionById.set(v.id, v.version_number);
      }
    }
  }

  const byId = new Map(agentRows.map((a) => [a.id, a]));
  return {
    leads: leads.map((lead) => {
      if (lead.owner_kind !== "ai" || !lead.owner_agent_id) return lead;
      const agent = byId.get(lead.owner_agent_id);
      if (!agent) return lead;
      return {
        ...lead,
        owner_agent: {
          id: agent.id,
          name: agent.name,
          version_number: agent.published_version_id
            ? (versionById.get(agent.published_version_id) ?? null)
            : null,
        },
      };
    }),
    error: null,
  };
}

/**
 * Anexa a próxima ação proposta pelo agente aos leads que a receberam.
 *
 * Os candidatos são buscados por CONTATO na org inteira, e não só neste
 * pipeline: `resolveActiveLeadForContact` precisa enxergar todos os negócios
 * abertos da pessoa para poder chamar de ambíguo o que é ambíguo. Recortando a
 * lista por pipeline, dois negócios ambíguos em boards diferentes apareceriam
 * como um único negócio em cada board, e os dois exibiriam a mesma proposta.
 */
/**
 * Abre um item de caixa por proposta sem dono — no máximo um por contato.
 *
 * Deduplicado por (kind, ref_id, status='open') porque o board é lido a cada
 * refresh: sem isto, um contato ambíguo produziria um item por render até a
 * caixa virar ruído e ninguém mais olhar.
 *
 * Falha aqui NÃO derruba o board: o aviso é importante, mas menos que a tela
 * abrir. O erro sobe para o Sentry pelo caminho normal de exceção não tratada
 * do handler — o que não pode é o usuário perder o board por causa do aviso.
 */
async function avisaAmbiguas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  ambiguas: PropostaAmbigua[],
): Promise<void> {
  if (ambiguas.length === 0) return;

  const abertos = new Set<string>();
  const contactIds = [...new Set(ambiguas.map((a) => a.contact_id))];
  for (const ids of chunks(contactIds)) {
    for (let offset = 0; ; offset += BOARD_PAGE_SIZE) {
      const { data: jaAbertos } = await supabase
        .from("agent_inbox_items")
        .select("ref_id")
        .eq("organization_id", organizationId)
        .eq("kind", "next_action_ambiguous")
        .eq("status", "open")
        .in("ref_id", ids)
        .order("id")
        .range(offset, offset + BOARD_PAGE_SIZE - 1);
      const page = (jaAbertos ?? []) as Array<{ ref_id: string }>;
      for (const row of page) abertos.add(row.ref_id);
      if (page.length < BOARD_PAGE_SIZE) break;
    }
  }

  const novos = ambiguas
    .filter((a) => !abertos.has(a.contact_id))
    .map((a) => ({
      organization_id: organizationId,
      kind: "next_action_ambiguous",
      severity: "warn",
      title: `A IA propôs uma próxima ação, mas o contato tem ${a.candidateIds.length} negócios abertos`,
      body: `Proposta: "${a.texto}". Escolha a qual negócio ela pertence — o sistema não adivinha para não executar no negócio errado.`,
      ref_kind: "contact",
      ref_id: a.contact_id,
      status: "open",
    }));
  if (novos.length === 0) return;

  for (const rows of chunks(novos)) {
    await supabase.from("agent_inbox_items").insert(rows);
  }
}

/**
 * Anexa o score aos leads que o têm — LEFT JOIN, nunca INNER.
 *
 * Score ausente é estado legítimo (sinal insuficiente, cenário 17). Um INNER
 * apagaria do quadro justamente os leads sem sinal, que são os que mais
 * precisam de atenção humana — o oposto do que o produto existe para fazer.
 *
 * A faixa vem PERSISTIDA e é entregue como está: recalculá-la aqui (ou na UI)
 * ignoraria a histerese e devolveria o card piscando na fronteira, no único
 * lugar onde o CHECK de coerência não alcança.
 */
async function withScores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  leads: Lead[],
): Promise<{ leads: Lead[]; error: string | null }> {
  if (leads.length === 0) return { leads, error: null };

  const porLead = new Map<string, NonNullable<Lead["score"]>>();
  for (const ids of chunks(leads.map((lead) => lead.id))) {
    const { data, error } = await supabase
      .from("crm_lead_scores")
      .select("lead_id, ai_probability, ai_probability_reason, ai_probability_band, ai_probability_evidence, ai_probability_at")
      .eq("organization_id", organizationId)
      .in("lead_id", ids);
    if (error) return { leads, error: error.message };
    for (const row of (data ?? []) as Array<{
      lead_id: string;
      ai_probability: number | string | null;
      ai_probability_reason: string | null;
      ai_probability_band: string | null;
      ai_probability_evidence: { factors?: unknown } | null;
      ai_probability_at: string | null;
    }>) {
      // `numeric` chega como string no supabase-js; `null` continua null — e a
      // diferença entre null e 0 é justamente o que não pode se perder aqui.
      if (row.ai_probability === null || row.ai_probability_band === null) continue;
      const factors = Array.isArray(row.ai_probability_evidence?.factors)
        ? (row.ai_probability_evidence.factors as NonNullable<Lead["score"]>["factors"])
        : [];
      porLead.set(row.lead_id, {
        probability: Number(row.ai_probability),
        reason: row.ai_probability_reason ?? "",
        band: row.ai_probability_band as NonNullable<Lead["score"]>["band"],
        factors,
        at: row.ai_probability_at,
      });
    }
  }

  return {
    leads: leads.map((lead) => {
      const score = porLead.get(lead.id);
      return score ? { ...lead, score } : lead;
    }),
    error: null,
  };
}

/**
 * Anexa a conversa mais recente do contato — o atalho do quadro para o inbox.
 *
 * LEFT, como o score: lead sem contato (criado à mão, vindo de webhook) e
 * contato sem conversa são estados normais, e sumir com esses cards do quadro
 * seria esconder justamente os que ninguém atendeu ainda.
 *
 * A MAIS RECENTE por contato, não todas: o card mostra uma linha, e escolher na
 * UI exigiria trazer o histórico inteiro de cada lead para descartar quase tudo.
 *
 * Ordena por `last_message_at` e fica com a primeira de cada contato — as
 * conversas já vêm ordenadas, então o primeiro visto é o mais recente.
 */
async function withConversas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  leads: Lead[],
): Promise<{ leads: Lead[]; error: string | null }> {
  const contactIds = [...new Set(leads.map((l) => l.contact_id).filter((c): c is string => !!c))];
  if (contactIds.length === 0) return { leads, error: null };

  const porContato = new Map<string, NonNullable<Lead["conversa"]>>();
  for (const ids of chunks(contactIds)) {
    for (let offset = 0; ; offset += BOARD_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, contact_id, last_message_preview, last_message_at, unread_count_for_assignee")
        .eq("organization_id", organizationId)
        .in("contact_id", ids)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        // Empates em `last_message_at` precisam de uma segunda chave para a
        // fronteira entre páginas não mudar de ordem.
        .order("id")
        .range(offset, offset + BOARD_PAGE_SIZE - 1);
      if (error) return { leads, error: error.message };

      for (const row of (data ?? []) as Array<{
        id: string;
        contact_id: string;
        last_message_preview: string | null;
        last_message_at: string | null;
        unread_count_for_assignee: number | null;
      }>) {
        // Primeira vista vence: a consulta já veio ordenada por atividade.
        if (porContato.has(row.contact_id)) continue;
        porContato.set(row.contact_id, {
          id: row.id,
          preview: row.last_message_preview,
          last_message_at: row.last_message_at,
          unread: row.unread_count_for_assignee ?? 0,
        });
      }
      if ((data ?? []).length < BOARD_PAGE_SIZE) break;
    }
  }

  return {
    leads: leads.map((lead) => {
      const conversa = lead.contact_id ? porContato.get(lead.contact_id) : undefined;
      return conversa ? { ...lead, conversa } : lead;
    }),
    error: null,
  };
}

/**
 * Anexa contatos em uma única leitura limitada à organização já autorizada.
 * Lead sem contato é válido e continua no quadro sem uma identidade inventada.
 */
async function withContacts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  leads: Lead[],
): Promise<{ leads: Lead[]; error: string | null }> {
  const contactIds = [...new Set(leads.map((lead) => lead.contact_id).filter((id): id is string => !!id))];
  if (contactIds.length === 0) return { leads, error: null };

  const byId = new Map<string, { id: string; full_name: string | null }>();
  for (const ids of chunks(contactIds)) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, display_name, name")
      .eq("organization_id", organizationId)
      .in("id", ids);
    if (error) return { leads, error: error.message };
    for (const contact of (data ?? []) as Array<{
      id: string;
      display_name: string | null;
      name: string | null;
    }>) {
      byId.set(contact.id, {
        id: contact.id,
        full_name: contact.display_name ?? contact.name ?? null,
      });
    }
  }
  return {
    leads: leads.map((lead) => {
      const contact = lead.contact_id ? byId.get(lead.contact_id) : undefined;
      return contact ? { ...lead, contact } : lead;
    }),
    error: null,
  };
}

async function withNextActions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  leads: Lead[],
  defaultPipelineId: string | null,
): Promise<{ leads: Lead[]; error: string | null }> {
  const contactIds = [
    ...new Set(leads.map((l) => l.contact_id).filter((c): c is string => !!c)),
  ];
  if (contactIds.length === 0) return { leads, error: null };

  const estados: EstadoDoContato[] = [];
  const candidatos: Array<LeadCandidate & { contact_id: string | null }> = [];
  for (const ids of chunks(contactIds)) {
    // A chave única de lead_state torna a página normalmente pequena, mas a
    // paginação ainda impede que uma mudança futura da tabela silencie contatos
    // depois do max_rows.
    for (let offset = 0; ; offset += BOARD_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("lead_state")
        .select("contact_id, next_action, next_action_seq, updated_at")
        .eq("organization_id", organizationId)
        .in("contact_id", ids)
        .not("next_action", "is", null)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(offset, offset + BOARD_PAGE_SIZE - 1);
      if (error) return { leads, error: error.message };
      const page = (data ?? []) as EstadoDoContato[];
      estados.push(...page);
      if (page.length < BOARD_PAGE_SIZE) break;
    }

    // Há muitos negócios abertos possíveis para os mesmos 500 contatos; este
    // é o caso que realmente pode atravessar max_rows dentro de um só chunk.
    for (let offset = 0; ; offset += BOARD_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("crm_leads")
        .select(
          "id, organization_id, pipeline_id, status, last_activity_at, created_at, contact_id",
        )
        .eq("organization_id", organizationId)
        .eq("status", "open")
        .in("contact_id", ids)
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .order("id")
        .range(offset, offset + BOARD_PAGE_SIZE - 1);
      if (error) return { leads, error: error.message };
      const page = (data ?? []) as Array<LeadCandidate & { contact_id: string | null }>;
      candidatos.push(...page);
      if (page.length < BOARD_PAGE_SIZE) break;
    }
  }

  if (!estados || estados.length === 0) return { leads, error: null };

  const { porLead, ambiguas } = roteiaProximasAcoes(
    estados,
    candidatos,
    { defaultPipelineId },
  );

  // Recusar o palpite não pode virar silêncio: a proposta que não achou dono vai
  // para a caixa, onde um humano desambigua. Escrever a partir de um GET não é
  // bonito, e é deliberado — a ambiguidade só EXISTE quando se olha o conjunto
  // de negócios abertos AGORA, e é aqui que esse olhar acontece. Fazer no
  // momento da escrita da proposta perderia o caso em que o segundo negócio
  // nasce depois dela.
  await avisaAmbiguas(supabase, organizationId, ambiguas);

  if (porLead.size === 0) return { leads, error: null };

  return {
    leads: leads.map((lead) => {
      const acao = porLead.get(lead.id);
      return acao ? { ...lead, next_action: acao } : lead;
    }),
    error: null,
  };
}

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id: pipelineId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }
  const authUser = await loadAuthUser();
  const activeOrg = authUser ? await resolveActiveOrg(authUser) : null;
  if (!activeOrg) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }
  const t = (texto: string) => traduzir(texto, authUser?.idioma ?? "pt-BR");

  const { data: pipeline, error: pipelineErr } = await supabase
    .from("crm_pipelines")
    .select("*")
    .eq("id", pipelineId)
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .maybeSingle();
  if (pipelineErr) return fail("internal_error", pipelineErr.message, 500, { requestId });
  if (!pipeline) return fail("resource_not_found", t("Pipeline não encontrado."), 404, { requestId });

  // A linha do funil é a fonte confiável do tenant. Depois de a RLS autorizar
  // essa linha, TODAS as leituras dependentes carregam `organization_id`
  // explícito — não basta o id do funil numa sessão que participa de duas orgs.
  const organizationId = activeOrg.orgId;
  const [
    { data: stages, error: stagesErr },
    leadsResult,
  ] = await Promise.all([
    supabase
      .from("crm_stages")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("pipeline_id", pipelineId)
      .eq("is_archived", false)
      .order("position"),
    loadAllBoardLeads(supabase, organizationId, pipelineId),
  ]);

  if (stagesErr) return fail("internal_error", stagesErr.message, 500, { requestId });
  if (leadsResult.error) return fail("internal_error", leadsResult.error, 500, { requestId });

  const leadsWithOwner = await withOwnerAgents(
    supabase,
    organizationId,
    leadsResult.leads,
  );
  if (leadsWithOwner.error) {
    return fail("internal_error", leadsWithOwner.error, 500, { requestId });
  }

  const { data: pipelinePadrao } = await supabase
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_default", true)
    .maybeSingle();

  const leadsComAcao = await withNextActions(
    supabase,
    organizationId,
    leadsWithOwner.leads,
    (pipelinePadrao as { id: string } | null)?.id ?? null,
  );
  if (leadsComAcao.error) {
    return fail("internal_error", leadsComAcao.error, 500, { requestId });
  }

  const leadsComScore = await withScores(
    supabase,
    organizationId,
    leadsComAcao.leads,
  );
  if (leadsComScore.error) {
    return fail("internal_error", leadsComScore.error, 500, { requestId });
  }

  const leadsComContato = await withContacts(
    supabase,
    organizationId,
    leadsComScore.leads,
  );
  if (leadsComContato.error) {
    return fail("internal_error", leadsComContato.error, 500, { requestId });
  }
  const leadsComConversa = await withConversas(
    supabase,
    organizationId,
    leadsComContato.leads,
  );
  if (leadsComConversa.error) {
    return fail("internal_error", leadsComConversa.error, 500, { requestId });
  }

  const board: BoardData = {
    pipeline: pipeline as Pipeline,
    stages: (stages ?? []) as Stage[],
    leads: leadsComConversa.leads,
    summary: calculateBoardSummary(leadsComConversa.leads),
  };

  return ok(board, { requestId });
}
