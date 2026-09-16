import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { avaliarValidadeDaConexao, lerValidadeConexao } from "./validade";

const AGORA = Date.parse("2026-09-15T12:00:00.000Z");
const DIAS = 24 * 60 * 60 * 1000;
const em = (dias: number) => new Date(AGORA + dias * DIAS).toISOString();

describe("validade da autorização de anúncios", () => {
  it("avisa no limite exato de sete dias e distingue vencimento já ocorrido", () => {
    expect(avaliarValidadeDaConexao({ token_expires_at: em(7) }, AGORA).estado).toBe("expirando");
    expect(avaliarValidadeDaConexao({ token_expires_at: em(7.01) }, AGORA).estado).toBe("valida");
    expect(avaliarValidadeDaConexao({ token_expires_at: em(0) }, AGORA).estado).toBe("expirada");
    expect(avaliarValidadeDaConexao({ token_expires_at: em(-1) }, AGORA).estado).toBe("expirada");
  });

  it("usa o primeiro prazo entre token e acesso aos dados", () => {
    expect(avaliarValidadeDaConexao({ token_expires_at: em(60), data_access_expires_at: em(2) }, AGORA))
      .toEqual({ estado: "expirando", venceEm: em(2) });
    expect(avaliarValidadeDaConexao({ token_expires_at: em(-1), data_access_expires_at: em(60) }, AGORA).estado)
      .toBe("expirada");
  });

  it("ausência, data inválida e tipo de token não prometem validade eterna", () => {
    for (const metadados of [null, {}, { token_type: "SYSTEM_USER" }, { token_expires_at: "inválida" }]) {
      expect(avaliarValidadeDaConexao(metadados, AGORA)).toEqual({ estado: "desconhecida", venceEm: null });
    }
  });

  it("lê somente metadados da organização confiável, sem consultar o token", async () => {
    const consulta = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    const from = vi.fn().mockReturnValue(consulta);
    expect(await lerValidadeConexao({ from } as unknown as SupabaseClient, "org-teste"))
      .toEqual({ estado: "desconhecida", venceEm: null });
    expect(from).toHaveBeenCalledWith("ad_insights_connections");
    expect(consulta.select).toHaveBeenCalledWith("token_expires_at, data_access_expires_at, token_checked_at, token_type");
    expect(consulta.eq.mock.calls).toEqual([["organization_id", "org-teste"], ["platform", "meta_ads"]]);
  });
});
