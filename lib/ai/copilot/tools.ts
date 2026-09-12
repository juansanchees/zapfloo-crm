import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { tool, type ToolSet } from "@/lib/agent-engine/edge/llm/run-model-call";
import { audit } from "@/lib/audit";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { TOOL_CATALOG } from "@/lib/mcp/tools/catalog";
import { getToolByName } from "@/lib/mcp/tools";
import type { McpContext } from "@/lib/mcp/types";

/**
 * Revisão humana, não filtro automático. Uma ferramenta nova no catálogo
 * nunca chega ao copiloto só por ter sido marcada como segura.
 */
export const COPILOT_TOOL_NAMES = [
  "crm_list_conversations",
  "crm_search_contacts",
  "crm_list_leads",
  "crm_list_pipelines",
  "crm_list_appointments",
  "crm_list_followups",
  "crm_list_at_risk_leads",
  "crm_search_products",
  "crm_list_team_members",
] as const;

export type CopilotToolName = (typeof COPILOT_TOOL_NAMES)[number];

export interface CopilotToolExecution {
  name: CopilotToolName;
  durationMs: number;
  success: boolean;
}

export interface CopilotSource {
  kind: string;
  label: string;
  href: string;
}

const SOURCE_BY_TOOL: Record<CopilotToolName, CopilotSource> = {
  crm_list_conversations: { kind: "conversation", label: "Conversas", href: "/app/inbox" },
  crm_search_contacts: { kind: "contact", label: "Contatos", href: "/app/contacts" },
  crm_list_leads: { kind: "lead", label: "Oportunidades", href: "/app/kanban" },
  crm_list_pipelines: { kind: "pipeline", label: "Funis", href: "/app/kanban" },
  crm_list_appointments: { kind: "appointment", label: "Agenda", href: "/app/agenda" },
  crm_list_followups: { kind: "followup", label: "Retomadas", href: "/app/ai/followups" },
  crm_list_at_risk_leads: { kind: "risk", label: "Radar", href: "/app/radar" },
  crm_search_products: { kind: "product", label: "Produtos", href: "/app/products" },
  crm_list_team_members: { kind: "team", label: "Equipe", href: "/app/settings/team" },
};

export function sourcesFromExecutions(
  executions: readonly CopilotToolExecution[],
): CopilotSource[] {
  const seen = new Set<string>();
  const sources: CopilotSource[] = [];
  for (const execution of executions) {
    if (!execution.success) continue;
    const source = SOURCE_BY_TOOL[execution.name];
    const key = `${source.kind}:${source.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(source);
  }
  return sources;
}

interface CreateCopilotToolsInput {
  organizationId: string;
  userId: string;
  role: Role;
  requestId: string;
  supabase: SupabaseClient;
}

function assertReviewedTool(name: CopilotToolName) {
  const definition = getToolByName(name);
  const metadata = TOOL_CATALOG.find((entry) => entry.name === name);
  if (
    !definition ||
    definition.category !== "read" ||
    definition.requiresScope !== "mcp:read" ||
    !metadata ||
    metadata.risco !== "seguro" ||
    metadata.apenasHumano === true
  ) {
    throw new Error(`ferramenta não autorizada para o copiloto: ${name}`);
  }
  return definition;
}

export function createCopilotTools(input: CreateCopilotToolsInput): {
  tools: ToolSet;
  executions: CopilotToolExecution[];
} {
  const executions: CopilotToolExecution[] = [];
  const tools: ToolSet = {};
  const ctx: McpContext = {
    organizationId: input.organizationId,
    role: input.role,
    actor: { type: "user", id: input.userId, role: input.role },
    apiTokenId: "",
    requestId: input.requestId,
    supabase: input.supabase,
  };

  for (const name of COPILOT_TOOL_NAMES) {
    const definition = assertReviewedTool(name);
    if (ROLE_RANK[input.role] < ROLE_RANK[definition.requiresRole]) continue;
    const inputSchema = z.object(definition.inputSchema);
    tools[name] = tool({
      description: definition.description,
      inputSchema,
      execute: async (raw) => {
        const startedAt = Date.now();
        let success = false;
        try {
          const args = inputSchema.parse(raw);
          const result = await definition.handler(args as never, ctx);
          success = true;
          return result;
        } finally {
          const execution = {
            name,
            durationMs: Date.now() - startedAt,
            success,
          } satisfies CopilotToolExecution;
          executions.push(execution);
          // Conteúdo e argumentos podem conter PII. A auditoria guarda só o
          // nome revisado, duração e desfecho da consulta.
          await audit({
            action: "copilot.tool_consulted",
            actorUserId: input.userId,
            organizationId: input.organizationId,
            resourceType: "copilot_tool",
            requestId: input.requestId,
            metadata: {
              tool_name: name,
              duration_ms: execution.durationMs,
              success,
            },
          });
        }
      },
    });
  }

  return { tools, executions };
}
