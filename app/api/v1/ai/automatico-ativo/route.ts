/**
 * GET /api/v1/ai/automatico-ativo — existe atendimento automático nesta org?
 *
 * ## Por que uma rota só para isto
 *
 * O selo de comando do Inbox dizia "Automático atendendo" em toda conversa sem
 * dono e sem trava — **sem saber se existe algum automático**. Numa instalação
 * que ainda não configurou agente nenhum (o estado de todo primeiro deploy), a
 * tela afirmava que o robô estava cuidando de conversas que ninguém estava
 * respondendo. É a frase tranquilizadora que a doutrina proíbe, e ela cai
 * justamente na primeira impressão, que é P0.
 *
 * `GET /api/v1/ai/agents` responderia, mas exige `manager+` — e quem vive no
 * Inbox é o `agent`. Alargar aquela rota exporia prompt, guardrails e modelo a
 * quem não precisa. Esta devolve UM booleano: o mínimo que a tela precisa para
 * parar de afirmar o que não sabe.
 *
 * O predicado é `agenteAtende` (`lib/ai/agents/no-ar.ts`), a MESMA régua que o
 * worker legado e a tela usam — e não `published_version_id` sozinho: o motor
 * moderno exige versão publicada, mas o worker legado responde sem ela, e
 * perguntar só pela versão diria "não há automático" numa org onde há.
 *
 * Este parágrafo já disse "o mesmo predicado que o worker usa: `is_active` +
 * não arquivado", e isso VENCEU quando o worker parou de escolher por
 * `is_active` — a rota seguiu contando agente pausado como automático de pé,
 * afirmando "IA atendendo" logo depois de o dono pausar. É por isso que os dois
 * lados agora importam a mesma função em vez de descreverem um ao outro.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { agenteAtende } from "@/lib/ai/agents/no-ar";
import { lerModoDeAcessoDaIa, lerNumerosDeTeste } from "@/lib/ai/elegibilidade/pre-go-live";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", {
    requestId,
    resource: "ai_agents",
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return authz.response;

  // A resposta é uma projeção sem prompt, telefone ou segredo. O admin client
  // garante que um papel `agent` também veja o último erro operacional; TODAS
  // as consultas continuam estreitas pelo orgId vindo da sessão revalidada.
  const supabase = createAdminClient();
  // `head: true` + `count` não serve mais: a régua olha quatro colunas por
  // linha, e uma contagem no banco não sabe respondê-la sem duplicar a regra em
  // SQL — que é como ela se desencontrou da primeira vez.
  const [agents, channels, balanceIncident] = await Promise.all([
    supabase.from("ai_agents").select("kind, is_active, published_version_id, archived_at")
      .eq("organization_id", authz.org.orgId).is("archived_at", null),
    supabase.from("channel_sessions").select("id,status,metadata,archived_at")
      .eq("organization_id", authz.org.orgId).is("archived_at", null),
    // Saldo de plataforma é compartilhado por todos os tenants. Se outra
    // organização foi a primeira a descobrir que ele acabou, esta também
    // precisa parar de prometer atendimento — sem revelar provider, código ou
    // qualquer detalhe técnico ao cliente.
    supabase.from("incidents").select("id")
      .eq("type", "ai_provider_balance_exhausted")
      .neq("status", "resolved").limit(1).maybeSingle(),
  ]);
  if (agents.error || channels.error || balanceIncident.error) {
    return fail("internal_error", agents.error?.message ?? channels.error?.message ?? balanceIncident.error?.message ?? "status_unavailable", 500, { requestId });
  }

  const ativo = (agents.data ?? []).some(agenteAtende);
  if (!ativo) return ok({ ativo: false, estado: "desligada", motivo: "nenhum_agente_publicado", numeros_autorizados: 0, canal_id: null }, { requestId });
  const working = (channels.data ?? []).filter((channel) => channel.status === "WORKING");
  if (working.length === 0) return ok({ ativo: false, estado: "desligada", motivo: "whatsapp_desconectado", numeros_autorizados: 0, canal_id: null }, { requestId });

  if (balanceIncident.data) return ok({
    ativo: false, estado: "desligada", motivo: "saldo_da_plataforma", numeros_autorizados: 0,
    canal_id: working[0]?.id ?? null,
  }, { requestId });

  const restritos = working.filter((channel) => lerModoDeAcessoDaIa(channel.metadata) !== "open");
  if (restritos.length === 0) return ok({
    ativo: true, estado: "atendendo_todos", motivo: null, numeros_autorizados: 0,
    canal_id: working[0]?.id ?? null,
  }, { requestId });
  const numeros = new Set(restritos.flatMap((channel) => lerNumerosDeTeste(channel.metadata)));
  return ok({
    ativo: true, estado: "em_teste", motivo: null, numeros_autorizados: numeros.size,
    canal_id: restritos[0]?.id ?? null,
  }, { requestId });
}
