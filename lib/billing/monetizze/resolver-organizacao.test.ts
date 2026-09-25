// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  createOrganizationResolutionDependencies,
  maskBuyerEmail,
  resolveMonetizzeOrganization,
  sha256BuyerEmail,
  type OrganizationResolutionDependencies,
} from "./resolver-organizacao";
import { createCheckoutReference } from "./checkout-reference";

const SECRET = "monetizze-chave-unica-ficticia-com-32-bytes";
const NOW = new Date("2026-09-24T12:00:00.000Z");
const ORG_SRC = "11111111-1111-4111-8111-111111111111";
const ORG_EMAIL = "22222222-2222-4222-8222-222222222222";

function deps(overrides: Partial<OrganizationResolutionDependencies> = {}): OrganizationResolutionDependencies {
  return {
    organizationExists: vi.fn(async () => true),
    findAcceptedAdminOrganizationIdsByEmail: vi.fn(async () => [ORG_EMAIL]),
    ...overrides,
  };
}

describe("resolução segura de organização para evento normalizado", () => {
  it("src válido vence o e-mail e a organização é validada pelo id assinado", async () => {
    const sourceReference = createCheckoutReference(ORG_SRC, { secret: SECRET, now: NOW });
    const d = deps();
    const result = await resolveMonetizzeOrganization(
      { sourceReference, buyerEmail: "admin@example.test" },
      { secret: SECRET, now: NOW, dependencies: d },
    );

    expect(result).toMatchObject({ kind: "resolved", via: "signed_src", organizationId: ORG_SRC });
    expect(d.organizationExists).toHaveBeenCalledWith(ORG_SRC);
    expect(d.findAcceptedAdminOrganizationIdsByEmail).not.toHaveBeenCalled();
  });

  it("sem src válido casa e-mail somente quando há um admin aceito em uma única organização", async () => {
    const result = await resolveMonetizzeOrganization(
      { sourceReference: "adulterado", buyerEmail: " Admin@Example.Test " },
      { secret: SECRET, now: NOW, dependencies: deps() },
    );

    expect(result).toEqual({
      kind: "resolved",
      via: "admin_email",
      organizationId: ORG_EMAIL,
      buyerEmailHash: sha256BuyerEmail("admin@example.test"),
      buyerEmailMasked: "a***@example.test",
    });
  });

  it.each([
    { organizations: [], reason: "no_admin_match" },
    { organizations: [ORG_SRC, ORG_EMAIL], reason: "ambiguous_admin_email" },
  ])("$reason vai para a fila sem atribuir por palpite", async ({ organizations, reason }) => {
    const result = await resolveMonetizzeOrganization(
      { buyerEmail: "admin@example.test" },
      {
        secret: SECRET,
        now: NOW,
        dependencies: deps({ findAcceptedAdminOrganizationIdsByEmail: vi.fn(async () => organizations) }),
      },
    );
    expect(result).toMatchObject({ kind: "pending", reason });
    expect(result).not.toHaveProperty("organizationId");
  });

  it("sem src e sem e-mail preserva a compra como pendente", async () => {
    await expect(resolveMonetizzeOrganization(
      {},
      { secret: SECRET, now: NOW, dependencies: deps() },
    )).resolves.toEqual({
      kind: "pending",
      reason: "missing_identity",
      buyerEmailHash: null,
      buyerEmailMasked: null,
    });
  });

  it("UUID alegado no body não escolhe organização", async () => {
    const input = { claimedOrganizationId: ORG_SRC } as unknown as Parameters<typeof resolveMonetizzeOrganization>[0];
    const result = await resolveMonetizzeOrganization(
      input,
      { secret: SECRET, now: NOW, dependencies: deps() },
    );
    expect(result).toMatchObject({ kind: "pending", reason: "missing_identity" });
    expect(result).not.toHaveProperty("organizationId");
  });

  it("src assinado para organização inexistente não é confiado e cai para fila", async () => {
    const sourceReference = createCheckoutReference(ORG_SRC, { secret: SECRET, now: NOW });
    const result = await resolveMonetizzeOrganization(
      { sourceReference },
      { secret: SECRET, now: NOW, dependencies: deps({ organizationExists: vi.fn(async () => false) }) },
    );
    expect(result).toMatchObject({ kind: "pending", reason: "missing_identity" });
  });

  it("normaliza, mascara e hasheia sem persistir e-mail aberto", () => {
    expect(maskBuyerEmail(" Pessoa+tag@Example.COM ")).toBe("p***@example.com");
    expect(sha256BuyerEmail(" Pessoa+tag@Example.COM ")).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256BuyerEmail(" Pessoa+tag@Example.COM ")).toBe(sha256BuyerEmail("pessoa+tag@example.com"));
  });

  it("consultas service role validam organização e vínculo admin aceito/não revogado", async () => {
    const calls: Array<[string, ...unknown[]]> = [];
    const organizationBuilder = {
      select: (...args: unknown[]) => { calls.push(["org.select", ...args]); return organizationBuilder; },
      eq: (...args: unknown[]) => { calls.push(["org.eq", ...args]); return organizationBuilder; },
      maybeSingle: async () => ({ data: { id: ORG_SRC }, error: null }),
    };
    const membershipBuilder = {
      select: (...args: unknown[]) => { calls.push(["member.select", ...args]); return membershipBuilder; },
      eq: (...args: unknown[]) => { calls.push(["member.eq", ...args]); return membershipBuilder; },
      not: (...args: unknown[]) => { calls.push(["member.not", ...args]); return membershipBuilder; },
      is: (...args: unknown[]) => { calls.push(["member.is", ...args]); return membershipBuilder; },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: [{ organization_id: ORG_EMAIL }], error: null }).then(resolve);
      },
    };
    const admin = {
      from: (table: string) => table === "organizations" ? organizationBuilder : membershipBuilder,
      auth: {
        admin: {
          listUsers: vi.fn(async () => ({
            data: { users: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "admin@example.test" }] },
            error: null,
          })),
        },
      },
    };
    const dependencies = createOrganizationResolutionDependencies(admin as never);

    await expect(dependencies.organizationExists(ORG_SRC)).resolves.toBe(true);
    await expect(dependencies.findAcceptedAdminOrganizationIdsByEmail("admin@example.test"))
      .resolves.toEqual([ORG_EMAIL]);
    expect(calls).toContainEqual(["org.eq", "id", ORG_SRC]);
    expect(calls).toContainEqual(["member.eq", "user_id", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
    expect(calls).toContainEqual(["member.eq", "role", "admin"]);
    expect(calls).toContainEqual(["member.not", "accepted_at", "is", null]);
    expect(calls).toContainEqual(["member.is", "revoked_at", null]);
  });

  it("não associa automaticamente quando a página 50 vem cheia e não prova exaustão", async () => {
    const targetId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const filler = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "outro@example.test" };
    const fullPage = Array.from({ length: 1000 }, () => filler);
    const listUsers = vi.fn(async ({ page }: { page: number }) => ({
      data: {
        users: page === 1
          ? [{ id: targetId, email: "admin@example.test" }, ...fullPage.slice(1)]
          : fullPage,
      },
      error: null,
    }));
    const from = vi.fn(() => { throw new Error("não deve consultar membership sem prova de exaustão"); });
    const dependencies = createOrganizationResolutionDependencies({
      auth: { admin: { listUsers } },
      from,
    } as never);

    await expect(dependencies.findAcceptedAdminOrganizationIdsByEmail("admin@example.test"))
      .resolves.toEqual([]);
    expect(listUsers).toHaveBeenCalledTimes(50);
    expect(from).not.toHaveBeenCalled();
  });

  it("página curta prova exaustão e permite usar o único admin encontrado", async () => {
    const targetId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const membershipBuilder = {
      select: () => membershipBuilder,
      eq: () => membershipBuilder,
      not: () => membershipBuilder,
      is: () => membershipBuilder,
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: [{ organization_id: ORG_EMAIL }], error: null }).then(resolve);
      },
    };
    const dependencies = createOrganizationResolutionDependencies({
      auth: { admin: { listUsers: vi.fn(async () => ({
        data: { users: [{ id: targetId, email: "admin@example.test" }] },
        error: null,
      })) } },
      from: () => membershipBuilder,
    } as never);

    await expect(dependencies.findAcceptedAdminOrganizationIdsByEmail("admin@example.test"))
      .resolves.toEqual([ORG_EMAIL]);
  });

  it("múltiplos usuários com o mesmo e-mail continuam pendentes", async () => {
    const filler = Array.from({ length: 999 }, (_, index) => ({
      id: `bbbbbbbb-0000-4000-8000-${String(index).padStart(12, "0")}`,
      email: `outro${index}@example.test`,
    }));
    const listUsers = vi.fn(async ({ page }: { page: number }) => ({
      data: {
        users: page === 1
          ? [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", email: "admin@example.test" }, ...filler]
          : [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", email: "admin@example.test" }],
      },
      error: null,
    }));
    const dependencies = createOrganizationResolutionDependencies({
      auth: { admin: { listUsers } },
      from: vi.fn(() => { throw new Error("ambiguidade não consulta membership"); }),
    } as never);

    await expect(dependencies.findAcceptedAdminOrganizationIdsByEmail("admin@example.test"))
      .resolves.toEqual([]);
    expect(listUsers).toHaveBeenCalledTimes(2);
  });
});
