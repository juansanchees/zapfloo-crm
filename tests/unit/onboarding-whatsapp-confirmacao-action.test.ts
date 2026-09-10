// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Shared from "@/app/actions/onboarding/_shared";
import type { OnboardingState } from "@/lib/schemas/onboarding";

const f = vi.hoisted(() => ({
  audit: vi.fn(),
  checkHealth: vi.fn(),
  ctx: vi.fn(),
  getAdapter: vi.fn(),
  redirect: vi.fn(),
  resolveSessionRef: vi.fn(),
}));

vi.mock("@/app/actions/onboarding/_shared", async (original) => ({
  ...(await original<typeof Shared>()),
  requireOnboardingCtx: f.ctx,
}));
vi.mock("@/lib/audit", () => ({ audit: f.audit }));
vi.mock("@/lib/channels", () => ({
  CHANNEL_SESSION_REF_COLUMNS:
    "provider, waha_session_name, meta_phone_number_id, zernio_account_id",
  getAdapter: f.getAdapter,
  resolveSessionRef: f.resolveSessionRef,
}));
vi.mock("next/navigation", () => ({ redirect: f.redirect }));

interface LinhaDeCanal {
  id: string;
  organization_id: string;
  provider: "waha" | "meta_cloud" | "zernio";
  status: string;
  archived_at: string | null;
  waha_session_name: string | null;
  meta_phone_number_id: string | null;
  zernio_account_id: string | null;
}

interface CenarioDoBanco {
  canal: LinhaDeCanal | null;
  erroCanal: { code?: string; message: string } | null;
  onboarding: OnboardingState;
  escritasNaOrganizacao: Record<string, unknown>[];
  filtrosDoCanal: Array<[string, unknown]>;
}

let banco: CenarioDoBanco;

function resultadoDaConsulta(
  tabela: string,
  operacao: "select" | "update",
  filtros: Array<[string, unknown]>,
  patch: Record<string, unknown> | null,
) {
  if (tabela === "channel_sessions") {
    if (banco.erroCanal) return { data: null, error: banco.erroCanal };
    banco.filtrosDoCanal.push(...filtros);
    const pertence = banco.canal
      && filtros.every(([campo, valor]) => campo === "id"
        ? banco.canal?.id === valor
        : campo === "organization_id"
          ? banco.canal?.organization_id === valor
          : true);
    return { data: pertence ? banco.canal : null, error: null };
  }

  if (tabela === "organizations" && operacao === "select") {
    return {
      data: { onboarding_state: banco.onboarding, onboarded_at: null },
      error: null,
    };
  }

  if (tabela === "organizations" && operacao === "update") {
    banco.escritasNaOrganizacao.push(patch ?? {});
    banco.onboarding = (patch?.onboarding_state ?? {}) as OnboardingState;
    return { data: null, error: null };
  }

  throw new Error(`Tabela inesperada no teste: ${tabela}`);
}

function consulta(tabela: string) {
  let operacao: "select" | "update" = "select";
  let patch: Record<string, unknown> | null = null;
  const filtros: Array<[string, unknown]> = [];
  const query = {
    select: vi.fn(() => query),
    update: vi.fn((valores: Record<string, unknown>) => {
      operacao = "update";
      patch = valores;
      return query;
    }),
    eq: vi.fn((campo: string, valor: unknown) => {
      filtros.push([campo, valor]);
      return query;
    }),
    maybeSingle: vi.fn(async () => resultadoDaConsulta(tabela, operacao, filtros, patch)),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(resultadoDaConsulta(tabela, operacao, filtros, patch)).then(resolve, reject),
  };
  return query;
}

const admin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: admin }));

import {
  markWhatsappConfigured,
  type MarkWhatsappConfiguredResult,
} from "@/app/actions/onboarding/skipWhatsapp";
import { OnboardingError } from "@/app/actions/onboarding/_shared";

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const CANAL = "33333333-3333-4333-8333-333333333333";

function canal(overrides: Partial<LinhaDeCanal> = {}): LinhaDeCanal {
  return {
    id: CANAL,
    organization_id: ORG,
    provider: "waha",
    status: "STARTING",
    archived_at: null,
    waha_session_name: "org_11111111",
    meta_phone_number_id: null,
    zernio_account_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  banco = {
    canal: canal(),
    erroCanal: null,
    onboarding: {
      welcome: {
        accepted_at: "2026-09-10T12:00:00.000Z",
        timezone: "America/Sao_Paulo",
        display_name: "QA",
      },
      ai: { agent_id: USER, skipped: true },
    },
    escritasNaOrganizacao: [],
    filtrosDoCanal: [],
  };
  admin.mockImplementation(() => ({ from: (tabela: string) => consulta(tabela) }));
  f.ctx.mockResolvedValue({ orgId: ORG, userId: USER, role: "admin" });
  f.resolveSessionRef.mockImplementation((linha: LinhaDeCanal) =>
    linha.waha_session_name ?? linha.meta_phone_number_id ?? linha.zernio_account_id,
  );
  f.getAdapter.mockReturnValue({ checkHealth: f.checkHealth });
  f.checkHealth.mockResolvedValue({ reachable: true, status: "WORKING", detail: null });
});

describe("confirmação confiável do WhatsApp no onboarding", () => {
  it("aceita DB ainda STARTING quando o transporte confirma WORKING e preserva o restante do onboarding", async () => {
    await markWhatsappConfigured({ channel_session_id: CANAL });

    expect(banco.filtrosDoCanal).toEqual([
      ["organization_id", ORG],
      ["id", CANAL],
    ]);
    expect(f.getAdapter).toHaveBeenCalledWith("waha");
    expect(f.resolveSessionRef).toHaveBeenCalledWith(expect.objectContaining({ id: CANAL }));
    expect(f.checkHealth).toHaveBeenCalledWith({
      organizationId: ORG,
      sessionRef: "org_11111111",
    });
    expect(banco.onboarding).toEqual({
      welcome: expect.objectContaining({ display_name: "QA" }),
      ai: { agent_id: USER, skipped: true },
      whatsapp: { channel_session_id: CANAL, status: "WORKING" },
    });
    expect(f.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "onboarding.whatsapp_configured",
      actorUserId: USER,
      organizationId: ORG,
      resourceId: CANAL,
    }));
    expect(f.redirect).toHaveBeenCalledWith("/onboarding");
  });

  it("confirma também canal oficial existente pela saúde do adapter, sem depender de IA", async () => {
    banco.onboarding = {
      welcome: {
        accepted_at: "2026-09-10T12:00:00.000Z",
        timezone: "America/Sao_Paulo",
        display_name: "QA",
      },
    };
    banco.canal = canal({
      provider: "meta_cloud",
      status: "WORKING",
      waha_session_name: null,
      meta_phone_number_id: "123456789",
    });

    await markWhatsappConfigured({ channel_session_id: CANAL });

    expect(f.getAdapter).toHaveBeenCalledWith("meta_cloud");
    expect(f.checkHealth).toHaveBeenCalledWith({
      organizationId: ORG,
      sessionRef: "123456789",
    });
    expect(banco.onboarding.whatsapp).toEqual({
      channel_session_id: CANAL,
      status: "WORKING",
    });
  });

  it("recusa status e tenant fornecidos pelo navegador antes de consultar o banco", async () => {
    const result = await markWhatsappConfigured({
      channel_session_id: CANAL,
      organization_id: ORG,
      status: "WORKING",
    });

    expect(result).toEqual({ ok: false, error: "invalid_input" } satisfies MarkWhatsappConfiguredResult);
    expect(admin).not.toHaveBeenCalled();
    expect(banco.escritasNaOrganizacao).toEqual([]);
    expect(f.redirect).not.toHaveBeenCalled();
  });

  it("STARTING confirmado pelo transporte não grava nem avança", async () => {
    f.checkHealth.mockResolvedValue({ reachable: true, status: "STARTING", detail: null });

    await expect(markWhatsappConfigured({ channel_session_id: CANAL })).resolves.toEqual({
      ok: false,
      error: "invalid_state",
    });
    expect(banco.escritasNaOrganizacao).toEqual([]);
    expect(f.audit).not.toHaveBeenCalled();
    expect(f.redirect).not.toHaveBeenCalled();
  });

  it("canal de outra organização é indistinguível de ausente e não chega ao transporte", async () => {
    banco.canal = canal({ organization_id: "44444444-4444-4444-8444-444444444444" });

    await expect(markWhatsappConfigured({ channel_session_id: CANAL })).resolves.toEqual({
      ok: false,
      error: "not_found",
    });
    expect(banco.filtrosDoCanal).toContainEqual(["organization_id", ORG]);
    expect(f.getAdapter).not.toHaveBeenCalled();
    expect(banco.escritasNaOrganizacao).toEqual([]);
  });

  it("canal arquivado não pode concluir onboarding mesmo que o transporte diga WORKING", async () => {
    banco.canal = canal({ archived_at: "2026-09-10T13:00:00.000Z" });

    await expect(markWhatsappConfigured({ channel_session_id: CANAL })).resolves.toEqual({
      ok: false,
      error: "channel_archived",
    });
    expect(f.checkHealth).not.toHaveBeenCalled();
    expect(banco.escritasNaOrganizacao).toEqual([]);
    expect(f.redirect).not.toHaveBeenCalled();
  });

  it("falha de consulta não vira conexão concluída", async () => {
    banco.erroCanal = { code: "08006", message: "connection failure" };

    await expect(markWhatsappConfigured({ channel_session_id: CANAL })).resolves.toEqual({
      ok: false,
      error: "db_error",
    });
    expect(f.getAdapter).not.toHaveBeenCalled();
    expect(banco.escritasNaOrganizacao).toEqual([]);
    expect(f.redirect).not.toHaveBeenCalled();
  });

  it("falha ao abrir o cliente de banco também volta como erro explícito", async () => {
    admin.mockImplementationOnce(() => {
      throw new Error("service role indisponível");
    });

    await expect(markWhatsappConfigured({ channel_session_id: CANAL })).resolves.toEqual({
      ok: false,
      error: "db_error",
    });
    expect(f.getAdapter).not.toHaveBeenCalled();
    expect(banco.escritasNaOrganizacao).toEqual([]);
    expect(f.redirect).not.toHaveBeenCalled();
  });

  it("transporte inconclusivo não reaproveita o WORKING espelhado no banco", async () => {
    banco.canal = canal({ status: "WORKING" });
    f.checkHealth.mockResolvedValue({
      reachable: false,
      status: null,
      detail: "transport_unavailable",
    });

    await expect(markWhatsappConfigured({ channel_session_id: CANAL })).resolves.toEqual({
      ok: false,
      error: "upstream_unavailable",
    });
    expect(banco.escritasNaOrganizacao).toEqual([]);
    expect(f.redirect).not.toHaveBeenCalled();
  });

  it("RBAC negado impede banco, transporte e avanço", async () => {
    f.ctx.mockRejectedValue(new OnboardingError("forbidden", "Negado"));

    await expect(markWhatsappConfigured({ channel_session_id: CANAL })).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(admin).not.toHaveBeenCalled();
    expect(f.getAdapter).not.toHaveBeenCalled();
    expect(f.redirect).not.toHaveBeenCalled();
  });
});
