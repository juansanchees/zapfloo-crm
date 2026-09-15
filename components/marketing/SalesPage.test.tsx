import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PLANOS, formatarPrecoMensal } from "@/lib/billing/planos";
import { SalesPage, type PlanosDaPagina } from "./SalesPage";

describe("página pública de vendas", () => {
  it("lê preços e limites do catálogo central de planos", () => {
    render(<SalesPage />);

    for (const [id, plano] of Object.entries(PLANOS)) {
      const card = screen.getByTestId(`plano-${id}`);
      expect(within(card).getByText(plano.nome)).toBeInTheDocument();
      expect(card.textContent?.replace(/\u00a0/g, " ")).toContain(
        formatarPrecoMensal(plano.precoMensalCents).replace(/\u00a0/g, " "),
      );
    }
    expect(
      within(screen.getByTestId("plano-completo")).getByText(
        "Quadros sem limite: vendas, confirmação, entrega e pós-venda",
      ),
    ).toBeInTheDocument();
  });

  it("mudar o preço na configuração recebida muda a página sem editar o JSX", () => {
    const alterados: PlanosDaPagina = {
      ...PLANOS,
      basico: { ...PLANOS.basico, precoMensalCents: 12_300 },
    };
    render(<SalesPage planos={alterados} />);

    const card = screen.getByTestId("plano-basico");
    expect(card.textContent?.replace(/\u00a0/g, " ")).toContain("R$ 123");
    expect(card.textContent?.replace(/\u00a0/g, " ")).not.toContain("R$ 97");
  });

  it("lê as quantidades de cada plano da configuração recebida", () => {
    const alterados: PlanosDaPagina = {
      basico: {
        ...PLANOS.basico,
        limites: { numerosWhatsapp: 2, funcionariosIa: 4, usuarios: 6, funis: 8 },
      },
      essencial: {
        ...PLANOS.essencial,
        limites: { ...PLANOS.essencial.limites, usuarios: 9, funis: 11 },
      },
      completo: {
        ...PLANOS.completo,
        limites: { ...PLANOS.completo.limites, numerosWhatsapp: 12, funcionariosIa: 13, usuarios: 14 },
      },
    };
    render(<SalesPage planos={alterados} />);

    const basico = within(screen.getByTestId("plano-basico"));
    expect(basico.getByText("2 WhatsApp")).toBeInTheDocument();
    expect(basico.getByText("4 atendente de IA")).toBeInTheDocument();
    expect(basico.getByText("6 pessoa da equipe com acesso")).toBeInTheDocument();
    expect(basico.getByText("8 quadro de vendas")).toBeInTheDocument();

    const essencial = within(screen.getByTestId("plano-essencial"));
    expect(essencial.getByText("9 pessoas da equipe com acesso")).toBeInTheDocument();
    expect(essencial.getByText("11 quadros de vendas")).toBeInTheDocument();

    const completo = within(screen.getByTestId("plano-completo"));
    expect(completo.getByText("Até 12 WhatsApps e 13 atendentes de IA")).toBeInTheDocument();
    expect(completo.getByText("14 pessoas da equipe com acesso")).toBeInTheDocument();
  });

  it("mostra os seis cartões aprovados com a explicação de cada recurso", () => {
    render(<SalesPage />);

    const secao = screen.getByRole("heading", { name: "Uma atendente que não esquece ninguém" }).closest("section");
    expect(secao).not.toBeNull();
    const conteudo = within(secao!);
    expect(conteudo.getAllByRole("heading", { level: 3 })).toHaveLength(6);
    for (const [titulo, descricao] of [
      ["Responde na hora", "Nada de cliente esperando enquanto você atende outra pessoa."],
      ["Tira dúvidas com os seus preços", "Usa o seu catálogo e as informações que você cadastrou."],
      ["Marca horário", "Consulta os horários livres e agenda direto na conversa."],
      ["Chama de volta quem sumiu", "Manda mensagem na hora certa pra quem parou de responder."],
      ["Organiza tudo sozinha", "Cada cliente vai pra etapa certa: novo, interessado, agendado, fechado."],
      ["Passa pra você quando precisa", "Casos delicados vão pra uma pessoa da equipe, com a conversa inteira."],
    ] as const) {
      const cartao = conteudo.getByRole("heading", { name: titulo }).closest("article");
      expect(cartao).not.toBeNull();
      expect(within(cartao!).getByText(descricao, { exact: true })).toBeInTheDocument();
    }
  });

  it("recomenda somente o Essencial e mantém o teste grátis nos três planos", () => {
    render(<SalesPage />);

    expect(screen.getAllByText("Recomendado", { exact: true })).toHaveLength(1);
    expect(within(screen.getByTestId("plano-essencial")).getByText("Recomendado")).toBeInTheDocument();
    for (const id of Object.keys(PLANOS)) {
      expect(
        within(screen.getByTestId(`plano-${id}`)).getByRole("link", { name: "Testar grátis por 7 dias" }),
      ).toHaveAttribute("href", "https://crm.zapfloo.tech/signup");
    }
  });

  it("responde às seis perguntas aprovadas sobre configuração, uso e teste", () => {
    render(<SalesPage />);

    const secao = screen.getByRole("heading", { name: "Perguntas frequentes" }).closest("section");
    expect(secao).not.toBeNull();
    const perguntas = secao!.querySelectorAll("details");
    expect(perguntas).toHaveLength(6);
    for (const [pergunta, resposta] of [
      ["Preciso entender de tecnologia?", "Não. A configuração é feita com perguntas simples, e se você tiver site, a gente aproveita as informações dele."],
      ["A IA pode falar besteira pro meu cliente?", "Ela só responde com base no que você cadastrou e confere cada mensagem antes de enviar. Preço e informação que vêm do seu site só passam a valer depois que você aprova. E você pode assumir qualquer conversa a qualquer momento."],
      ["O que o teste grátis inclui?", "7 dias com todos os recursos do plano Completo. Não pedimos cartão."],
      ["E quando o teste acaba?", "Seus dados continuam lá. A atendente de IA pausa até você escolher um plano."],
      ["Funciona com o número que eu já uso?", "Sim. Você conecta o WhatsApp que já usa no negócio."],
      ["Posso trocar de plano depois?", "Pode, pra cima ou pra baixo, e nada do que você já tem é apagado."],
    ] as const) {
      const item = within(secao!).getByText(pergunta, { exact: true }).closest("details");
      expect(item).not.toBeNull();
      expect(within(item!).getByText(resposta, { exact: true })).toBeInTheDocument();
    }
  });

  it("só mostra o botão de WhatsApp quando há número configurado", () => {
    const { rerender } = render(<SalesPage />);
    expect(screen.queryByRole("link", { name: "Falar pelo WhatsApp" })).not.toBeInTheDocument();

    rerender(<SalesPage whatsappNumber="+55 (11) 99999-0000" />);
    expect(screen.getByRole("link", { name: "Falar pelo WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5511999990000",
    );
  });

  it("não inventa prova social nem inclui os termos comerciais proibidos", () => {
    render(<SalesPage />);
    expect(document.body.textContent).not.toMatch(
      /mais escolhido|24 horas|Hotmart|Monetizze|depoimento|clientes atendidos|(?:\d[\d.,]*|mil|milhares de|milhões de)\s+clientes|mais de \d+/i,
    );
  });
});
