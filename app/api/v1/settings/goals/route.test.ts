import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GET, PATCH } from "./route";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
let orgs: Record<string, { settings: Record<string, unknown> }>;
const updates: Array<{ id: string; settings: Record<string, unknown> }> = [];

function db() {
  return {
    from: (table: string) => {
      if (table !== "organizations") throw new Error(`tabela inesperada: ${table}`);
      return {
        select: () => ({
          eq: (_column: string, id: string) => ({
            maybeSingle: async () => ({ data: orgs[id] ?? null, error: null }),
          }),
        }),
        update: ({ settings }: { settings: Record<string, unknown> }) => ({
          eq: async (_column: string, id: string) => {
            if (orgs[id]) orgs[id].settings = settings;
            updates.push({ id, settings });
            return { error: null };
          },
        }),
      };
    },
  };
}

function request(body: unknown) {
  return new NextRequest("http://localhost/api/v1/settings/goals", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  updates.length = 0;
  orgs = {
    [ORG_A]: { settings: { routing: { max_retries: 3 }, sibling: true } },
    [ORG_B]: { settings: { sibling: "org-b" } },
  };
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: MEMBER },
    org: { orgId: ORG_A, role: "manager" },
  } as never);
  vi.mocked(createClient).mockResolvedValue(db() as never);
  vi.mocked(createAdminClient).mockReturnValue(db() as never);
});

describe("/api/v1/settings/goals", () => {
  it("agent lê defaults defensivos e não pode gravar", async () => {
    vi.mocked(requireRole)
      .mockResolvedValueOnce({ ok: true, user: { id: MEMBER }, org: { orgId: ORG_A, role: "agent" } } as never)
      .mockResolvedValueOnce({ ok: false, response: fail("forbidden_role", "Sem permissão.", 403) } as never);

    expect((await (await GET()).json()).data).toEqual({ team: {}, members: {} });
    expect((await PATCH(request({}))).status).toBe(403);
    expect(updates).toEqual([]);
    expect(requireRole).toHaveBeenNthCalledWith(1, "agent", expect.any(Object));
    expect(requireRole).toHaveBeenNthCalledWith(2, "manager", expect.any(Object));
  });

  it("manager preserva chaves irmãs e nunca atualiza outra organização", async () => {
    const response = await PATCH(request({
      currency: "BRL",
      team: { monthly_conversations: 300 },
      members: { [MEMBER]: { monthly_conversations: 60 } },
    }));

    expect(response.status).toBe(200);
    expect(orgs[ORG_A]!.settings).toMatchObject({ routing: { max_retries: 3 }, sibling: true });
    expect(orgs[ORG_A]!.settings.operational_goals).toMatchObject({ currency: "BRL" });
    expect(orgs[ORG_B]!.settings).toEqual({ sibling: "org-b" });
    expect(updates.map((update) => update.id)).toEqual([ORG_A]);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "goals.config_changed",
      metadata: { has_team_revenue_target: false, has_team_conversations_target: true, members_with_targets: 1 },
    }));
  });

  it("recusa payload inválido com 422 antes de escrever", async () => {
    expect((await PATCH(request({ team: { monthly_conversations: 2.5 } }))).status).toBe(422);
    expect(updates).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("repetir o mesmo payload não cria uma chave paralela", async () => {
    const payload = { team: { monthly_conversations: 30 }, members: {} };
    await PATCH(request(payload));
    await PATCH(request(payload));
    expect(orgs[ORG_A]!.settings.operational_goals).toEqual({ team: { monthly_conversations: 30 }, members: {} });
  });
});
