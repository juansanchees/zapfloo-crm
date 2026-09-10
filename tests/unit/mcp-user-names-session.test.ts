// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserNames } from "@/lib/mcp/tools/_users";
import type { McpContext } from "@/lib/mcp/types";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
const getUserById = vi.fn();
const membership = {
  select: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(),
};
const from = vi.fn(() => membership);
const admin = { from, auth: { admin: { getUserById } } };
const ctx: McpContext = {
  organizationId: "org-confiavel", requestId: "req", role: "agent",
  actor: { type: "user", id: "pessoa" }, apiTokenId: "", supabase: {} as never,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAdminClient).mockReturnValue(admin as never);
  membership.select.mockReturnValue(membership);
  membership.eq.mockReturnValue(membership);
  membership.in.mockReturnValue(membership);
  membership.is.mockResolvedValue({ data: [{ user_id: "permitido" }], error: null });
  getUserById.mockResolvedValue({ data: { user: { user_metadata: {
    full_name: "Nome permitido", email: "nao-expor@teste.invalid", phone: "nao-expor",
  } } }, error: null });
});

describe("nomes dos responsáveis sem elevar as consultas do copiloto", () => {
  it("filtra organização, IDs solicitados e membros ativos antes do lookup mínimo", async () => {
    const nomes = await resolveUserNames(ctx, ["permitido", "permitido", "alheio", null]);
    expect(from).toHaveBeenCalledWith("user_organizations");
    expect(membership.eq).toHaveBeenCalledWith("organization_id", "org-confiavel");
    expect(membership.in).toHaveBeenCalledWith("user_id", ["permitido", "alheio"]);
    expect(membership.is).toHaveBeenCalledWith("revoked_at", null);
    expect([...nomes]).toEqual([["permitido", "Nome permitido"]]);
    expect(getUserById).toHaveBeenCalledTimes(1);
    expect(getUserById).toHaveBeenCalledWith("permitido");
  });

  it("não consulta Auth para ID não solicitado mesmo se o lookup devolver linha extra", async () => {
    membership.is.mockResolvedValue({ data: [{ user_id: "permitido" }, { user_id: "extra" }], error: null });
    expect([...await resolveUserNames(ctx, ["permitido"])]).toEqual([["permitido", "Nome permitido"]]);
    expect(getUserById).not.toHaveBeenCalledWith("extra");
  });

  it.each([
    { data: [], error: null },
    { data: [{ user_id: "permitido" }], error: { message: "falhou" } },
  ])("sem membership confirmado não consulta Auth: %j", async (resposta) => {
    membership.is.mockResolvedValue(resposta);
    expect([...await resolveUserNames(ctx, ["permitido"])]).toEqual([]);
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("não entrega metadata estruturada no lugar de full_name", async () => {
    getUserById.mockResolvedValue({ data: { user: { user_metadata: { full_name: { email: "nao-expor" } } } } });
    expect([...await resolveUserNames(ctx, ["permitido"])]).toEqual([["permitido", null]]);
  });

  it("falha individual de Auth degrada só o nome", async () => {
    getUserById.mockRejectedValue(new Error("Auth indisponível"));
    expect([...await resolveUserNames(ctx, ["permitido"])]).toEqual([["permitido", null]]);
  });

  it("bearer mantém o lookup original, sem consultar memberships ou trocar seu client", async () => {
    const integracao = { ...ctx, apiTokenId: "token-validado", supabase: admin as never };
    expect([...await resolveUserNames(integracao, ["permitido"])]).toEqual([["permitido", "Nome permitido"]]);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });
});
