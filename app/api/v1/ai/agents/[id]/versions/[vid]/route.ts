/**
 * GET   /api/v1/ai/agents/:id/versions/:vid  — fetch (manager+).
 * PATCH /api/v1/ai/agents/:id/versions/:vid  — edit (admin) — apenas se status='draft'.
 *
 * Spec 10 §4.4. Versões published/superseded/archived são imutáveis (409).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { versionPatchSchema } from "@/lib/ai/agents/validation";
import { traduzir } from "@/lib/i18n/dicionario";
import { podeManterSelecaoDeCredencial } from "@/lib/ai/credenciais/selecao";
import { resolverCredencialGerenciada } from "@/lib/ai/credenciais/gerenciada";
import { lerAmbiente } from "@/lib/instalacao/ambiente";

export const dynamic = "force-dynamic";

const VERSION_COLUMNS =
  "id, organization_id, agent_id, version_number, system_prompt, provider, model, credential_id, tool_ids, trigger_config, channel_session_id, max_steps, token_budget, cost_budget_cents, history_message_window, history_token_window, handoff_keywords, handoff_tool_enabled, cases_enabled, split_messages, split_max_chars, followup, operator_enabled, operator_model, operator_tool_ids, status, published_at, superseded_at, created_at, created_by,pipeline_ids,knowledge_source_ids";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string; vid: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const { id, vid } = await ctx.params;
  if (!UUID_RX.test(id) || !UUID_RX.test(vid)) {
    return fail("invalid_request", "ids inválidos.", 400, { requestId });
  }

  const authz = await requireRole("manager", { requestId, resource: "ai_agents" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org: activeOrg } = authz;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_agent_versions")
    .select(VERSION_COLUMNS)
    .eq("organization_id", activeOrg.orgId)
    .eq("agent_id", id)
    .eq("id", vid)
    .maybeSingle();

  if (error) return fail("internal_error", "Erro ao buscar version.", 500, { requestId });
  if (!data) return fail("not_found", t("Version não encontrada."), 404, { requestId });
  return ok(data, { requestId });
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const { id, vid } = await ctx.params;
  if (!UUID_RX.test(id) || !UUID_RX.test(vid)) {
    return fail("invalid_request", "ids inválidos.", 400, { requestId });
  }

  const authz = await requireRole("admin", { requestId, resource: "ai_agents" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user: authUser, org: activeOrg } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = versionPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return fail("invalid_request", "Body vazio.", 400, { requestId });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("ai_agent_versions")
    .select("id, status, agent_id, organization_id, credential_id, provider")
    .eq("id", vid)
    .eq("organization_id", activeOrg.orgId)
    .eq("agent_id", id)
    .maybeSingle();

  if (!existing) return fail("not_found", t("Version não encontrada."), 404, { requestId });
  if (existing.status !== "draft") {
    return fail("version_immutable", t("Apenas versões 'draft' podem ser editadas."), 409, {
      requestId,
      details: { current_status: existing.status },
    });
  }

  if (!podeManterSelecaoDeCredencial({
    isPlatformAdmin: authUser.is_platform_admin,
    solicitada: patch.credential_id,
    atual: existing.credential_id,
    providerSolicitado: patch.provider ?? existing.provider,
    providerAtual: existing.provider,
  })) {
    return fail(
      "forbidden_role",
      t("A credencial de inteligência é administrada pela equipe da plataforma."),
      403,
      { requestId },
    );
  }

  const update: Record<string, unknown> = {};
  if (patch.system_prompt !== undefined) update.system_prompt = patch.system_prompt;
  if (patch.provider !== undefined) update.provider = patch.provider;
  if (patch.model !== undefined) update.model = patch.model;
  if (patch.credential_id !== undefined) update.credential_id = patch.credential_id;
  const providerMudou = patch.provider !== undefined && patch.provider !== existing.provider;
  if (
    !authUser.is_platform_admin &&
    (providerMudou || (existing.credential_id === null && patch.credential_id === null))
  ) {
    const provider = patch.provider ?? existing.provider;
    const gerenciada = await resolverCredencialGerenciada({
      db: admin,
      organizationId: activeOrg.orgId,
      provider,
      instalacaoTemChave: lerAmbiente().chavesDeProvedor[provider] === true,
    });
    if (!gerenciada.ok) {
      return fail(
        gerenciada.erro === "consulta_falhou" ? "internal_error" : "credential_required",
        t("A equipe da plataforma precisa configurar uma chave compatível antes de salvar este agente."),
        gerenciada.erro === "consulta_falhou" ? 500 : 422,
        { requestId },
      );
    }
    update.credential_id = gerenciada.credentialId;
  }
  if (patch.tool_ids !== undefined) update.tool_ids = patch.tool_ids;
  if (patch.trigger_config !== undefined) update.trigger_config = patch.trigger_config;
  if (patch.channel_session_id !== undefined) update.channel_session_id = patch.channel_session_id;
  if (patch.max_steps !== undefined) update.max_steps = patch.max_steps;
  if (patch.token_budget !== undefined) update.token_budget = patch.token_budget;
  if (patch.cost_budget_cents !== undefined) update.cost_budget_cents = patch.cost_budget_cents;
  if (patch.history_message_window !== undefined)
    update.history_message_window = patch.history_message_window;
  if (patch.history_token_window !== undefined)
    update.history_token_window = patch.history_token_window;
  if (patch.handoff_keywords !== undefined) update.handoff_keywords = patch.handoff_keywords;
  if (patch.handoff_tool_enabled !== undefined)
    update.handoff_tool_enabled = patch.handoff_tool_enabled;
  if (patch.cases_enabled !== undefined) update.cases_enabled = patch.cases_enabled;
  if (patch.split_messages !== undefined) update.split_messages = patch.split_messages;
  if (patch.split_max_chars !== undefined) update.split_max_chars = patch.split_max_chars;
  if (patch.followup !== undefined) update.followup = patch.followup;

  const { data, error } = await admin
    .from("ai_agent_versions")
    .update(update)
    .eq("id", vid)
    .eq("organization_id", activeOrg.orgId)
    .select(VERSION_COLUMNS)
    .single();

  if (error || !data) {
    return fail("internal_error", "Erro ao atualizar version.", 500, { requestId });
  }

  void audit({
    action: "ai_agent.version_updated",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "ai_agent_version",
    resourceId: vid,
    requestId,
    metadata: { agent_id: id, fields: Object.keys(update) },
  });

  return ok(data, { requestId });
}
