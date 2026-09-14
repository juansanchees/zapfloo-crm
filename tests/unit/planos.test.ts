import { describe, expect, it } from "vitest";

import {
  PLANOS,
  PLANO_DE_RECURSOS_DO_TESTE,
  PLANO_DE_TETO_IA_DO_TESTE,
  limiteDoPlano,
  recursoDoPlano,
  resolverAcessoDaAssinatura,
} from "@/lib/billing/planos";
import { decidirOrcamento } from "@/lib/agent-engine/edge/llm/orcamento";

const CRIADA_EM = "2026-09-14T12:00:00.000Z";

describe("catálogo único dos planos", () => {
  it("guarda preços, limites e tetos aprovados em centavos", () => {
    expect(PLANOS.basico).toMatchObject({ precoMensalCents: 9_700, tetoIaMensalUsdCents: 400 });
    expect(PLANOS.essencial).toMatchObject({ precoMensalCents: 19_700, tetoIaMensalUsdCents: 800 });
    expect(PLANOS.completo).toMatchObject({ precoMensalCents: 39_700, tetoIaMensalUsdCents: 1_600 });
    expect(PLANOS.completo.limites.funis).toBeNull();
  });

  it("teste usa recursos do Completo e teto de IA do Básico", () => {
    const acesso = resolverAcessoDaAssinatura(
      { plano: "basico", situacao: "teste", organizacaoCriadaEm: CRIADA_EM },
      new Date("2026-09-18T12:00:00.000Z"),
    );
    expect(PLANO_DE_RECURSOS_DO_TESTE).toBe("completo");
    expect(PLANO_DE_TETO_IA_DO_TESTE).toBe("basico");
    expect(acesso).toMatchObject({
      planoDeRecursos: "completo",
      tetoIaMensalUsdCents: 400,
      acessoIa: "liberado",
      testeValido: true,
    });
    expect(limiteDoPlano(acesso, "numerosWhatsapp")).toBe(3);
    expect(recursoDoPlano(acesso, "radar")).toBe(true);
  });

  it("teste vence exatamente em 168 horas e só interrompe a IA", () => {
    const acesso = resolverAcessoDaAssinatura(
      { plano: "completo", situacao: "teste", organizacaoCriadaEm: CRIADA_EM },
      new Date("2026-09-21T12:00:00.000Z"),
    );
    expect(acesso).toMatchObject({ acessoIa: "teste_vencido", testeValido: false });
    expect(acesso.planoDeRecursos).toBe("completo");
  });

  it("ativar a mesma organização libera novamente a decisão única de IA", () => {
    const vencido = resolverAcessoDaAssinatura(
      { plano: "completo", situacao: "teste", organizacaoCriadaEm: CRIADA_EM },
      new Date("2026-09-22T12:00:00.000Z"),
    );
    const ativo = resolverAcessoDaAssinatura(
      { plano: "completo", situacao: "ativo", organizacaoCriadaEm: CRIADA_EM },
      new Date("2026-09-22T12:00:00.000Z"),
    );
    const entrada = {
      modo: "bloquear" as const,
      tetoCents: 1_600,
      gastoCents: 0,
      efetivoEm: new Date(0),
      agora: new Date("2026-09-22T12:00:00.000Z"),
      purpose: "agent_turn",
      chave: "on" as const,
      limiarPct: 80,
      avisadoNesteMes: false,
    };
    expect(decidirOrcamento({ ...entrada, acessoIa: vencido.acessoIa })).toMatchObject({
      acao: "bloquear",
      porque: "teste_vencido",
    });
    expect(decidirOrcamento({ ...entrada, acessoIa: ativo.acessoIa })).toMatchObject({
      acao: "seguir",
    });
  });

  it("pausado interrompe IA sem apagar os limites contratados", () => {
    const acesso = resolverAcessoDaAssinatura({
      plano: "essencial",
      situacao: "pausado",
      organizacaoCriadaEm: CRIADA_EM,
    });
    expect(acesso.acessoIa).toBe("plano_pausado");
    expect(limiteDoPlano(acesso, "usuarios")).toBe(3);
  });
});
