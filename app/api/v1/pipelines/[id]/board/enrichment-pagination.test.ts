import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  ranges: new Map<string, Array<[number, number]>>(),
  candidateRanges: [] as Array<[number, number]>,
  inCalls: new Map<string, string[][]>(),
}));

const leads = Array.from({ length: 1_001 }, (_, index) => ({
  id: `lead-${index + 1}`,
  organization_id: "org-a",
  pipeline_id: "p1",
  stage_id: "s1",
  title: `Lead ${index + 1}`,
  status: "open",
  value_cents: 100,
  currency: "BRL",
  contact_id: `contact-${index + 1}`,
  owner_kind: "ai",
  owner_agent_id: `agent-${index + 1}`,
  closed_at: null,
  position_in_stage: index + 1,
}));

const candidate = {
  id: "lead-1001",
  organization_id: "org-a",
  pipeline_id: "p1",
  status: "open",
  last_activity_at: "2026-09-18T12:00:00Z",
  created_at: "2026-09-18T11:00:00Z",
  contact_id: "contact-1001",
};

vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: vi.fn(async () => ({ id: "u", idioma: "pt-BR", organizations: [] })),
  resolveActiveOrg: vi.fn(async () => ({ orgId: "org-a", name: "A", role: "agent" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u" } }, error: null }) },
    from: (table: string) => {
      let selection = "";
      let range: [number, number] | null = null;
      let inValues: string[] = [];
      const query: Record<string, unknown> = {};
      for (const method of ["eq", "neq", "not", "order", "maybeSingle"]) query[method] = () => query;
      query.select = (value: string) => { selection = value; return query; };
      query.in = (_column: string, values: string[]) => {
        inValues = values;
        state.inCalls.set(table, [...(state.inCalls.get(table) ?? []), values]);
        return query;
      };
      query.range = (from: number, to: number) => {
        range = [from, to];
        state.ranges.set(table, [...(state.ranges.get(table) ?? []), range]);
        if (table === "crm_leads" && selection !== "*") state.candidateRanges.push(range);
        return query;
      };
      query.insert = () => Promise.resolve({ data: null, error: null });
      query.then = (resolve: (value: { data: unknown; error: null }) => unknown) => {
        const page = <T,>(rows: T[]) => rows.slice(range?.[0] ?? 0, (range?.[1] ?? rows.length - 1) + 1);

        if (table === "crm_pipelines") {
          const data = selection === "id"
            ? { id: "p1" }
            : { id: "p1", organization_id: "org-a", name: "Funil", settings: {} };
          return Promise.resolve({ data, error: null }).then(resolve);
        }
        if (table === "crm_stages") return Promise.resolve({ data: [], error: null }).then(resolve);
        if (table === "crm_leads" && selection === "*") {
          return Promise.resolve({ data: page(leads), error: null }).then(resolve);
        }
        if (table === "crm_leads") {
          // O primeiro chunk tem mais de 1.000 candidatos para um contato
          // ambíguo. A segunda página precisa ser lida antes de seguir para o
          // candidato real do último card do board.
          const ambiguous = Array.from({ length: 1_001 }, (_, index) => ({
            ...candidate,
            id: `ambiguous-${index + 1}`,
            contact_id: "contact-1",
            last_activity_at: "2026-09-18T10:00:00Z",
          }));
          const rows = inValues.includes("contact-1")
            ? ambiguous
            : inValues.includes("contact-1001")
              ? [candidate]
              : [];
          return Promise.resolve({ data: page(rows), error: null }).then(resolve);
        }
        if (table === "lead_state") {
          const rows = inValues.includes("contact-1")
            ? [{ contact_id: "contact-1", next_action: "Desambiguar", next_action_seq: 1, updated_at: "2026-09-18T10:00:00Z" }]
            : inValues.includes("contact-1001")
              ? [{ contact_id: "contact-1001", next_action: "Ligar para o cliente", next_action_seq: 2, updated_at: "2026-09-18T12:00:00Z" }]
              : [];
          return Promise.resolve({ data: page(rows), error: null }).then(resolve);
        }
        if (table === "ai_agents") {
          const rows = inValues.includes("agent-1001")
            ? [{ id: "agent-1001", name: "Agente depois de 1000", published_version_id: "version-1001" }]
            : [];
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        }
        if (table === "ai_agent_versions") {
          const rows = inValues.includes("version-1001") ? [{ id: "version-1001", version_number: 7 }] : [];
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        }
        if (table === "crm_lead_scores") {
          const rows = inValues.includes("lead-1001")
            ? [{ lead_id: "lead-1001", ai_probability: "0.91", ai_probability_reason: "quente", ai_probability_band: "hot", ai_probability_evidence: { factors: [] }, ai_probability_at: "2026-09-18T12:00:00Z" }]
            : [];
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        }
        if (table === "contacts") {
          const rows = inValues.includes("contact-1001") ? [{ id: "contact-1001", full_name: "Contato 1001" }] : [];
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        }
        if (table === "conversations") {
          const busy = Array.from({ length: 1_001 }, (_, index) => ({
            id: `conversation-${index + 1}`,
            contact_id: "contact-1",
            last_message_preview: "Ambígua",
            last_message_at: "2026-09-18T10:00:00Z",
            unread_count_for_assignee: 0,
          }));
          const rows = inValues.includes("contact-1")
            ? busy
            : inValues.includes("contact-1001")
              ? [{ id: "conversation-1001", contact_id: "contact-1001", last_message_preview: "Oi", last_message_at: "2026-09-18T12:00:00Z", unread_count_for_assignee: 3 }]
              : [];
          return Promise.resolve({ data: page(rows), error: null }).then(resolve);
        }
        if (table === "agent_inbox_items") {
          const rows = Array.from({ length: 1_001 }, () => ({ ref_id: "contact-1" }));
          return Promise.resolve({ data: page(rows), error: null }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      };
      return query;
    },
  })),
}));

describe("enriquecimento do board acima de max_rows", () => {
  beforeEach(() => {
    state.ranges = new Map();
    state.candidateRanges = [];
    state.inCalls = new Map();
  });

  it("mantém os dados de dono, score, contato, conversa e ação do card 1001", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("http://local/api/v1/pipelines/p1/board"),
      { params: Promise.resolve({ id: "p1" }) },
    );
    const body = await response.json() as { data: { leads: Array<Record<string, unknown>> } };
    const last = body.data.leads.find((lead) => lead.id === "lead-1001");

    expect(response.status).toBe(200);
    expect(last).toMatchObject({
      owner_agent: { name: "Agente depois de 1000", version_number: 7 },
      score: { probability: 0.91, band: "hot" },
      contact: { full_name: "Contato 1001" },
      conversa: { id: "conversation-1001", unread: 3 },
      next_action: { label: "Ligar para o cliente", seq: 2 },
    });
    for (const table of [
      "ai_agents",
      "ai_agent_versions",
      "lead_state",
      "crm_leads",
      "crm_lead_scores",
      "contacts",
      "conversations",
      "agent_inbox_items",
    ]) {
      expect(state.inCalls.get(table)?.every((ids) => ids.length <= 500)).toBe(true);
    }
    expect(state.ranges.get("conversations")).toContainEqual([0, 999]);
    expect(state.ranges.get("conversations")).toContainEqual([1000, 1999]);
    expect(state.candidateRanges).toContainEqual([1000, 1999]);
    expect(state.ranges.get("agent_inbox_items")).toContainEqual([1000, 1999]);
  });
});
