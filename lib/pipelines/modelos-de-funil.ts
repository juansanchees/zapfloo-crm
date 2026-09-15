/**
 * Fonte única dos modelos de funil usados no onboarding e na galeria do CRM.
 *
 * Os modelos de venda carregam `agent_stage_hint`: o agente sabe quando mover
 * um negócio. Os modelos de pós-venda não movem cards automaticamente; por
 * isso todas as etapas têm `passo: null` de propósito.
 */
import type { PropostaDeFunil } from "@/lib/onboarding/proposta-de-funil";

export type CategoriaDoModeloDeFunil = "vendas" | "pos_venda";

export interface ModeloDeFunil {
  id: string;
  titulo: string;
  descricao: string;
  categoria: CategoriaDoModeloDeFunil;
  /** Texto usado somente pela escolha de nicho no onboarding. */
  comoSeApresenta?: string;
  proposta: PropostaDeFunil;
}

export interface PacoteDeFunil extends ModeloDeFunil {
  comoSeApresenta: string;
}

export const MODELOS_DE_FUNIL: readonly ModeloDeFunil[] = [
  {
    id: "clinica",
    titulo: "Agendamentos",
    descricao: "Para clínica, consultório, salão e negócios com horário marcado.",
    categoria: "vendas",
    comoSeApresenta: "Clínica, consultório ou salão",
    proposta: {
      nome: "Agendamentos",
      etapas: [
        { nome: "Novo contato", passo: "new" },
        { nome: "Já respondi", passo: "contacted" },
        { nome: "Entendendo o caso", passo: "qualifying" },
        { nome: "Quer agendar", passo: "qualified" },
        { nome: "Escolhendo horário", passo: "negotiating" },
        { nome: "Consulta marcada", passo: "won" },
        { nome: "Não vai marcar", passo: "lost" },
      ],
    },
  },
  {
    id: "imobiliaria",
    titulo: "Interessados",
    descricao: "Para imobiliária e corretor acompanharem cada interessado.",
    categoria: "vendas",
    comoSeApresenta: "Imobiliária ou corretor",
    proposta: {
      nome: "Interessados",
      etapas: [
        { nome: "Novo interessado", passo: "new" },
        { nome: "Já respondi", passo: "contacted" },
        { nome: "Entendendo o que procura", passo: "qualifying" },
        { nome: "Sei o que oferecer", passo: "qualified" },
        { nome: "Visitando imóveis", passo: "negotiating" },
        { nome: "Fechou negócio", passo: "won" },
        { nome: "Desistiu", passo: "lost" },
      ],
    },
  },
  {
    id: "servicos",
    titulo: "Orçamentos",
    descricao: "Para serviços, agência e obra, do pedido ao fechamento.",
    categoria: "vendas",
    comoSeApresenta: "Serviços, agência ou obra",
    proposta: {
      nome: "Orçamentos",
      etapas: [
        { nome: "Pedido novo", passo: "new" },
        { nome: "Já respondi", passo: "contacted" },
        { nome: "Entendendo o projeto", passo: "qualifying" },
        { nome: "Orçamento enviado", passo: "qualified" },
        { nome: "Negociando", passo: "negotiating" },
        { nome: "Fechou", passo: "won" },
        { nome: "Não fechou", passo: "lost" },
      ],
    },
  },
  {
    id: "curso",
    titulo: "Matrículas",
    descricao: "Para curso, mentoria e infoproduto acompanharem inscrições.",
    categoria: "vendas",
    comoSeApresenta: "Curso, mentoria ou infoproduto",
    proposta: {
      nome: "Matrículas",
      etapas: [
        { nome: "Novo interessado", passo: "new" },
        { nome: "Já respondi", passo: "contacted" },
        { nome: "Tirando dúvidas", passo: "qualifying" },
        { nome: "Quer entrar", passo: "qualified" },
        { nome: "Fechando condições", passo: "negotiating" },
        { nome: "Matriculado", passo: "won" },
        { nome: "Desistiu", passo: "lost" },
      ],
    },
  },
  {
    id: "loja",
    titulo: "Vendas",
    descricao: "Para loja online ou de rua, do contato ao pedido pago.",
    categoria: "vendas",
    comoSeApresenta: "Loja — online ou de rua",
    proposta: {
      nome: "Vendas",
      etapas: [
        { nome: "Novo contato", passo: "new" },
        { nome: "Já respondi", passo: "contacted" },
        { nome: "Escolhendo o produto", passo: "qualifying" },
        { nome: "Vai levar", passo: "qualified" },
        { nome: "Aguardando pagamento", passo: "negotiating" },
        { nome: "Pedido pago", passo: "won" },
        { nome: "Não comprou", passo: "lost" },
      ],
    },
  },
  {
    id: "generico",
    titulo: "Clientes",
    descricao: "Um começo simples para qualquer outro tipo de negócio.",
    categoria: "vendas",
    comoSeApresenta: "Outro tipo de negócio",
    proposta: {
      nome: "Clientes",
      etapas: [
        { nome: "Novo contato", passo: "new" },
        { nome: "Já respondi", passo: "contacted" },
        { nome: "Entendendo a necessidade", passo: "qualifying" },
        { nome: "Proposta enviada", passo: "qualified" },
        { nome: "Negociando", passo: "negotiating" },
        { nome: "Fechou", passo: "won" },
        { nome: "Não fechou", passo: "lost" },
      ],
    },
  },
  {
    id: "confirmacao",
    titulo: "Confirmação",
    descricao: "Confirme dados, horário ou pedido depois da venda.",
    categoria: "pos_venda",
    proposta: {
      nome: "Confirmação",
      etapas: [
        { nome: "A confirmar", passo: null },
        { nome: "Dados conferidos", passo: null },
        { nome: "Confirmado", passo: null },
        { nome: "Precisa de ajuda", passo: null },
      ],
    },
  },
  {
    id: "entrega-de-acesso",
    titulo: "Entrega de acesso",
    descricao: "Acompanhe a liberação e o primeiro acesso do cliente.",
    categoria: "pos_venda",
    proposta: {
      nome: "Entrega de acesso",
      etapas: [
        { nome: "A liberar", passo: null },
        { nome: "Acesso enviado", passo: null },
        { nome: "Primeiro acesso", passo: null },
        { nome: "Pendência", passo: null },
      ],
    },
  },
  {
    id: "suporte-pos-venda",
    titulo: "Suporte pós-venda",
    descricao: "Organize pedidos de ajuda até a resolução.",
    categoria: "pos_venda",
    proposta: {
      nome: "Suporte pós-venda",
      etapas: [
        { nome: "Nova solicitação", passo: null },
        { nome: "Em atendimento", passo: null },
        { nome: "Aguardando cliente", passo: null },
        { nome: "Resolvido", passo: null },
      ],
    },
  },
  {
    id: "reativacao",
    titulo: "Reativação",
    descricao: "Retome contato com clientes inativos sem misturar vendas novas.",
    categoria: "pos_venda",
    proposta: {
      nome: "Reativação",
      etapas: [
        { nome: "Para retomar", passo: null },
        { nome: "Contato enviado", passo: null },
        { nome: "Demonstrou interesse", passo: null },
        { nome: "Não quer agora", passo: null },
      ],
    },
  },
] as const;

export const PACOTES: readonly PacoteDeFunil[] = MODELOS_DE_FUNIL.filter(
  (modelo): modelo is PacoteDeFunil => typeof modelo.comoSeApresenta === "string",
);

export const PACOTE_PADRAO: PacoteDeFunil = (() => {
  const pacote = PACOTES.find((modelo) => modelo.id === "generico");
  if (!pacote) throw new Error("Catálogo sem o pacote genérico do onboarding.");
  return pacote;
})();

export function encontrarModeloDeFunil(id: string): ModeloDeFunil | null {
  return MODELOS_DE_FUNIL.find((modelo) => modelo.id === id) ?? null;
}
