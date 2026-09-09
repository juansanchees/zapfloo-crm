import type pg from "pg";

import {
  runModelCall,
  type LlmEdgeConfig,
  type ModelMessage,
} from "@/lib/agent-engine/edge/llm/run-model-call";
import { flowGraphSchema, type FlowGraph } from "./graph-schema";
import { validateFlowForPublish } from "./validate-publish";

type ModelCall = typeof runModelCall;

export class FollowupDraftInvalidError extends Error {
  override readonly name = "followup_draft_invalid";
}

const SYSTEM_PROMPT = `Você cria rascunhos de follow-up para um CRM brasileiro.
Responda SOMENTE com um objeto JSON {"nodes":[],"edges":[]}.

Vocabulário permitido de nós:
- trigger: config {}
- wait: config {mode:"fixed",duration_ms: número entre 300000 e 7776000000} ou {mode:"smart",min_ms,max_ms,guidance?}
- condition: config {combinator:"and"|"or",branching:"combined"|"per_check",checks:[{id?,label?,field:"lead_stage"|"tag"|"steps_taken"|"last_outcome",op:"eq"|"neq"|"gte"|"lte"|"contains",value:string|number}]}
- ai_classify: config {classes:string[],branches:[{id,label}],grace_timeout_ms >= 900000,target:"last_reply"|"summary",hint?}; classes deve espelhar labels
- match_reply: config {branches:[{id,label,op:"eq"|"contains",pattern}],grace_timeout_ms >= 900000,save_to?,if_exists?}
- repeat: config {max_count:1..20}
- action: config {mode:"text",body:string} ou {mode:"ai_message",prompt_hint:string}; não invente template_id
- end: config {outcome:"converted"|"exhausted"|"custom",note?}

Cada nó precisa de id único, label de até 60 caracteres e position {x,y}. Cada aresta precisa de id, source, target, priority inteiro e condition. Use {type:"always"} para caminho normal. Em nós com ramos estáveis use {type:"branch",branch_id:"..."} e cubra todos os ramos, inclusive a saída de escape com {type:"always"}. O grafo precisa ter exatamente um trigger, todos os nós alcançáveis e todo caminho terminar em end. Nunca publique: entregue um rascunho para revisão humana.`;

function jsonDaResposta(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    throw new FollowupDraftInvalidError("ai_flow_invalid_json");
  }
}

export function parseFollowupDraft(text: string): FlowGraph {
  const parsed = flowGraphSchema.safeParse(jsonDaResposta(text));
  if (!parsed.success) throw new FollowupDraftInvalidError("ai_flow_invalid");
  const publishable = validateFlowForPublish(parsed.data);
  if (!publishable.ok) throw new FollowupDraftInvalidError("ai_flow_not_publishable");
  return parsed.data;
}

export async function generateFollowupDraft(
  input: { organizationId: string; description: string },
  deps: { pool: pg.Pool; cfg: LlmEdgeConfig; modelCall?: ModelCall },
): Promise<FlowGraph> {
  const messages: ModelMessage[] = [{ role: "user", content: input.description }];
  const call = await (deps.modelCall ?? runModelCall)(deps.pool, deps.cfg, {
    tenantId: input.organizationId,
    purpose: 'followup_generate_draft',
    system: SYSTEM_PROMPT,
    messages,
    timeoutMs: 35_000,
    maxOutputTokens: 4_000,
  });
  return parseFollowupDraft(call.result.text);
}
