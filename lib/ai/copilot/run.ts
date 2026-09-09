import type pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  runModelCall,
  type LlmEdgeConfig,
  type ModelMessage,
} from "@/lib/agent-engine/edge/llm/run-model-call";
import type { Role } from "@/lib/auth/types";
import type { Idioma } from "@/lib/i18n/idiomas";
import { copilotSystemPrompt } from "./prompt";
import type { CopilotRequest } from "./schema";
import {
  createCopilotTools,
  sourcesFromExecutions,
  type CopilotSource,
  type CopilotToolExecution,
} from "./tools";

interface RunCopilotInput extends CopilotRequest {
  organizationId: string;
  userId: string;
  role: Role;
  requestId: string;
  idioma: Idioma;
  supabase: SupabaseClient;
}

type ModelCall = typeof runModelCall;
type ToolsFactory = typeof createCopilotTools;

interface RunCopilotDeps {
  pool: pg.Pool;
  cfg: LlmEdgeConfig;
  modelCall?: ModelCall;
  toolsFactory?: ToolsFactory;
}

export interface CopilotResult {
  answer: string;
  sources: CopilotSource[];
  consulted_tools: string[];
}

export async function runCopilot(
  input: RunCopilotInput,
  deps: RunCopilotDeps,
): Promise<CopilotResult> {
  const toolsFactory = deps.toolsFactory ?? createCopilotTools;
  const modelCall = deps.modelCall ?? runModelCall;
  const { tools, executions } = toolsFactory({
    organizationId: input.organizationId,
    userId: input.userId,
    role: input.role,
    requestId: input.requestId,
    supabase: input.supabase,
  });
  const messages: ModelMessage[] = [
    ...input.history.map((message) => ({ role: message.role, content: message.content })),
    { role: "user", content: input.question },
  ];
  const call = await modelCall(deps.pool, deps.cfg, {
    tenantId: input.organizationId,
    purpose: 'copilot_query',
    system: copilotSystemPrompt(input.idioma),
    messages,
    tools,
    maxSteps: 8,
    timeoutMs: 30_000,
    maxOutputTokens: 1_200,
  });
  const answer = call.result.text.trim();
  if (!answer) throw new Error("empty_response");

  const successful = executions.filter(
    (execution): execution is CopilotToolExecution => execution.success,
  );
  return {
    answer,
    sources: sourcesFromExecutions(successful),
    consulted_tools: [...new Set(successful.map((execution) => execution.name))],
  };
}
