import { fimDoPeriodoDeTeste } from "@/lib/billing/periodo-de-teste";

export const PLANOS = {
  basico: {
    nome: "Básico",
    precoMensalCents: 9_700,
    tetoIaMensalUsdCents: 400,
    limites: { numerosWhatsapp: 1, funcionariosIa: 1, usuarios: 1, funis: 1 },
    recursos: {
      agenda: true,
      catalogo: true,
      baseDeConhecimento: true,
      leitorDeSite: true,
      followupsAutomaticos: false,
      googleAgenda: false,
      webhooks: false,
      radar: false,
    },
  },
  essencial: {
    nome: "Essencial",
    precoMensalCents: 19_700,
    tetoIaMensalUsdCents: 800,
    limites: { numerosWhatsapp: 1, funcionariosIa: 1, usuarios: 3, funis: 2 },
    recursos: {
      agenda: true,
      catalogo: true,
      baseDeConhecimento: true,
      leitorDeSite: true,
      followupsAutomaticos: true,
      googleAgenda: true,
      webhooks: false,
      radar: false,
    },
  },
  completo: {
    nome: "Completo",
    precoMensalCents: 39_700,
    tetoIaMensalUsdCents: 1_600,
    limites: { numerosWhatsapp: 3, funcionariosIa: 5, usuarios: 10, funis: null },
    recursos: {
      agenda: true,
      catalogo: true,
      baseDeConhecimento: true,
      leitorDeSite: true,
      followupsAutomaticos: true,
      googleAgenda: true,
      webhooks: true,
      radar: true,
    },
  },
} as const;

export type PlanoId = keyof typeof PLANOS;
export type SituacaoDaAssinatura = "teste" | "ativo" | "pausado";
export type LimiteDoPlano = keyof (typeof PLANOS)[PlanoId]["limites"];
export type RecursoDoPlano = keyof (typeof PLANOS)[PlanoId]["recursos"];
export type EstadoDoAcessoIa = "liberado" | "teste_vencido" | "plano_pausado";

export const PLANO_DE_RECURSOS_DO_TESTE: PlanoId = "completo";
export const PLANO_DE_TETO_IA_DO_TESTE: PlanoId = "basico";
export const PLANO_PADRAO_DE_ORGANIZACAO_EXISTENTE: PlanoId = "completo";

export type AssinaturaDaOrganizacao = {
  plano: PlanoId;
  situacao: SituacaoDaAssinatura;
  organizacaoCriadaEm: string;
};

export type AcessoResolvido = {
  planoContratado: PlanoId;
  planoDeRecursos: PlanoId;
  situacao: SituacaoDaAssinatura;
  fimDoTeste: string | null;
  testeValido: boolean;
  acessoIa: EstadoDoAcessoIa;
  tetoIaMensalUsdCents: number;
};

export function resolverAcessoDaAssinatura(
  assinatura: AssinaturaDaOrganizacao,
  agora = new Date(),
): AcessoResolvido {
  const fimDoTeste =
    assinatura.situacao === "teste"
      ? fimDoPeriodoDeTeste(assinatura.organizacaoCriadaEm)
      : null;
  const testeValido =
    assinatura.situacao === "teste" &&
    fimDoTeste !== null &&
    Date.parse(fimDoTeste) > agora.getTime();

  if (assinatura.situacao === "pausado") {
    return {
      planoContratado: assinatura.plano,
      planoDeRecursos: assinatura.plano,
      situacao: assinatura.situacao,
      fimDoTeste,
      testeValido: false,
      acessoIa: "plano_pausado",
      tetoIaMensalUsdCents: PLANOS[assinatura.plano].tetoIaMensalUsdCents,
    };
  }

  if (assinatura.situacao === "teste") {
    return {
      planoContratado: assinatura.plano,
      planoDeRecursos: PLANO_DE_RECURSOS_DO_TESTE,
      situacao: assinatura.situacao,
      fimDoTeste,
      testeValido,
      acessoIa: testeValido ? "liberado" : "teste_vencido",
      tetoIaMensalUsdCents: PLANOS[PLANO_DE_TETO_IA_DO_TESTE].tetoIaMensalUsdCents,
    };
  }

  return {
    planoContratado: assinatura.plano,
    planoDeRecursos: assinatura.plano,
    situacao: assinatura.situacao,
    fimDoTeste: null,
    testeValido: false,
    acessoIa: "liberado",
    tetoIaMensalUsdCents: PLANOS[assinatura.plano].tetoIaMensalUsdCents,
  };
}

export function limiteDoPlano(acesso: AcessoResolvido, limite: LimiteDoPlano): number | null {
  return PLANOS[acesso.planoDeRecursos].limites[limite];
}

export function recursoDoPlano(acesso: AcessoResolvido, recurso: RecursoDoPlano): boolean {
  return PLANOS[acesso.planoDeRecursos].recursos[recurso];
}

export function planoMinimoParaRecurso(recurso: RecursoDoPlano): PlanoId | null {
  return (Object.keys(PLANOS) as PlanoId[]).find((plano) => PLANOS[plano].recursos[recurso]) ?? null;
}

export function planoMinimoParaLimite(limite: LimiteDoPlano, quantidade: number): PlanoId | null {
  return (
    (Object.keys(PLANOS) as PlanoId[]).find((plano) => {
      const teto = PLANOS[plano].limites[limite];
      return teto === null || teto >= quantidade;
    }) ?? null
  );
}

export function formatarPrecoMensal(precoCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(precoCents / 100);
}
