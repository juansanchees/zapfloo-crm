import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  decryptOperationalGoalMembers,
  encryptOperationalGoalMembers,
} from "@/lib/metas/members-cipher";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GET, PATCH } from "./route";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/metas/members-cipher", () => ({
  decryptOperationalGoalMembers: vi.fn(),
  encryptOperationalGoalMembers: vi.fn(),
}));

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OTHER_MEMBER = "44444444-4444-4444-8444-444444444444";
let orgs: Record<string, { settings: Record<string, unknown> }>;
const updates: Array<{ id: string; settings: Record<string, unknown> }> = [];
let decryptFails = false;
let zeroUpdates = 0;
const casPredicates: Array<[string, unknown]> = [];

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
          eq: (_column: string, id: string) => ({
            eq: (column: string, value: unknown) => ({
              select: async () => {
                casPredicates.push([column, value]);
                if (zeroUpdates > 0) { zeroUpdates -= 1; orgs[id]!.settings.concurrent = true; return { data: [], error: null }; }
                if (orgs[id]) orgs[id].settings = settings;
                updates.push({ id, settings });
                return { data: [{ id }], error: null };
              },
            }),
          }),
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
  decryptFails = false;
  zeroUpdates = 0;
  casPredicates.length = 0;
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
  vi.mocked(encryptOperationalGoalMembers).mockImplementation((json) => `cipher:${json.length}`);
  vi.mocked(decryptOperationalGoalMembers).mockImplementation(() => decryptFails
    ? null
    : JSON.stringify({
        [MEMBER]: { monthly_conversations: 3 },
        [OTHER_MEMBER]: { monthly_conversations: 9 },
      }));
});

describe("/api/v1/settings/goals", () => {
  it("agent lê defaults defensivos e não pode gravar", async () => {
    vi.mocked(requireRole)
      .mockResolvedValueOnce({ ok: true, user: { id: MEMBER }, org: { orgId: ORG_A, role: "agent" } } as never)
      .mockResolvedValueOnce({ ok: false, response: fail("forbidden_role", "Sem permissão.", 403) } as never);

    expect((await (await GET()).json()).data).toEqual({ team: {}, members: {} });
    expect((await PATCH(request({}))).status).toBe(403);
    expect(updates).toEqual([]);
    expect(requireRole).toHaveBeenNthCalledWith(1, "agent", expect.objectContaining({ allowPlatformAdmin: true }));
    expect(requireRole).toHaveBeenNthCalledWith(2, "manager", expect.objectContaining({ allowPlatformAdmin: true }));
  });

  it("redige B para agent A quando o mapa está cifrado", async () => {
    orgs[ORG_A]!.settings.operational_goals = { members_enc: "cipher" };
    vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: MEMBER }, org: { orgId: ORG_A, role: "agent" } } as never);
    expect((await (await GET()).json()).data.members).toEqual({ [MEMBER]: { monthly_conversations: 3 } });
  });

  it("platform admin com papel agent vê e salva a configuração completa", async () => {
    orgs[ORG_A]!.settings.operational_goals = { members_enc: "cipher" };
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      user: { id: MEMBER, is_platform_admin: true },
      org: { orgId: ORG_A, role: "agent" },
    } as never);

    const read = await GET();
    expect(read.status).toBe(200);
    expect((await read.json()).data.members).toEqual({
      [MEMBER]: { monthly_conversations: 3 },
      [OTHER_MEMBER]: { monthly_conversations: 9 },
    });
    expect((await PATCH(request({ team: { monthly_conversations: 3 }, members: {} }))).status).toBe(200);
    expect(requireRole).toHaveBeenNthCalledWith(1, "agent", expect.objectContaining({ allowPlatformAdmin: true }));
    expect(requireRole).toHaveBeenNthCalledWith(2, "manager", expect.objectContaining({ allowPlatformAdmin: true }));
  });

  it("falha fechada na decifragem sem devolver metas", async () => {
    orgs[ORG_A]!.settings.operational_goals = { members_enc: "cipher" };
    decryptFails = true;
    const response = await GET();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain(OTHER_MEMBER);
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
    expect(orgs[ORG_A]!.settings.operational_goals).toMatchObject({ members_enc: expect.any(String) });
    expect((orgs[ORG_A]!.settings.operational_goals as Record<string, unknown>).members).toBeUndefined();
    expect(casPredicates).toContainEqual(["settings", JSON.stringify({ routing: { max_retries: 3 }, sibling: true })]);
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
    expect(orgs[ORG_A]!.settings.operational_goals).toEqual({ team: { monthly_conversations: 30 } });
  });

  it("falha fechada quando a cifra não está disponível", async () => {
    vi.mocked(encryptOperationalGoalMembers).mockReturnValue(null);
    expect((await PATCH(request({ members: { [MEMBER]: { monthly_conversations: 3 } } }))).status).toBe(422);
    expect(updates).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("repete CAS e preserva mudança irmã concorrente", async () => {
    zeroUpdates = 1;
    expect((await PATCH(request({ team: { monthly_conversations: 3 }, members: {} }))).status).toBe(200);
    expect(orgs[ORG_A]!.settings.concurrent).toBe(true);
    expect(updates).toHaveLength(1);
  });

  it("devolve conflito após três CAS sem auditar", async () => {
    zeroUpdates = 3;
    expect((await PATCH(request({ team: { monthly_conversations: 3 }, members: {} }))).status).toBe(409);
    expect(audit).not.toHaveBeenCalled();
  });
});
