import { describe, expect, it } from "vitest";
import { promptDoOnboarding, promptDoRascunho } from "@/lib/onboarding/prompt";
import { configuracaoRascunhoSchema, rascunhoSchema } from "@/lib/onboarding/rascunho";
import { welcomeSchema } from "@/lib/schemas/onboarding";

describe("prompt do onboarding", () => {
  it("aceita exatamente 20.000 unidades UTF-16 e recusa a unidade seguinte", () => {
    const prefixo = "Você atende os clientes de QA. Responda em frases curtas, peça apenas o que for necessário e chame uma pessoa do time assim que a dúvida sair do seu alcance.\n\nObjetivo do agente:\n";
    const espaco = 20000 - prefixo.length;
    const objetivo = "🧠".repeat(Math.floor(espaco / 2)) + (espaco % 2 ? "x" : "");
    const configuration = { name: "Lia", prompt_template: "support_minimal" as const, regras_da_casa: "", objetivo };

    expect(promptDoRascunho(configuration, { display_name: "QA", o_que_faz: null })).toBe(prefixo + objetivo);
    expect((prefixo + objetivo).length).toBe(20000);
    expect(() => promptDoRascunho({ ...configuration, objetivo: `${objetivo}x` }, { display_name: "QA", o_que_faz: null }))
      .toThrow("draft_prompt_too_long");
  });
  it("inclui objetivo e segmento sem confundir objetivo com regras e preserva leitura antiga", () => {
    const configuration = configuracaoRascunhoSchema.parse({ name: "Lia", prompt_template: "support_minimal", regras_da_casa: "Confirme o horário.", objetivo: "Qualificar pedidos de orçamento." });
    const business = welcomeSchema.parse({ display_name: "Negócio QA", segmento: "servicos" });
    const prompt = promptDoRascunho(configuration, { ...business, o_que_faz: null });
    expect(prompt).toContain("Segmento do negócio: Serviços, agência ou obra");
    expect(prompt).toContain("Objetivo do agente:\nQualificar pedidos de orçamento.");
    expect(prompt).toContain("Regras deste rascunho:\nConfirme o horário.");
    expect(configuracaoRascunhoSchema.safeParse({ name: "Lia", prompt_template: "support_minimal", regras_da_casa: "" }).success).toBe(true);
    expect(welcomeSchema.safeParse({ display_name: "QA", segmento: "inventado" }).success).toBe(false);
  });
  it("não trunca objetivo para caber no teto total do prompt", () => {
    expect(() => promptDoRascunho({ name: "Lia", prompt_template: "support_minimal", regras_da_casa: "", objetivo: "x".repeat(20000) }, { display_name: "QA", o_que_faz: null })).toThrow("draft_prompt_too_long");
  });
  it("continua lendo rascunho antigo acima do teto para permitir correção", () => {
    const legado = { revision: 1, configuration: { name: "Lia", prompt_template: "support_minimal", regras_da_casa: "", objetivo: "x".repeat(20001) } };
    expect(rascunhoSchema.safeParse(legado).success).toBe(true);
  });
  it("preserva negócio/ramo e o tom do caminho legado sem inventar nicho", () => {
    expect(promptDoOnboarding("support_minimal", "Clínica QA", "odontologia"))
      .toBe("Você atende os clientes de Clínica QA, que é: odontologia. Responda em frases curtas, peça apenas o que for necessário e chame uma pessoa do time assim que a dúvida sair do seu alcance.");
    expect(promptDoOnboarding("ecommerce_professional", "Negócio QA"))
      .toBe("Você atende os clientes de Negócio QA. Fale de forma objetiva, cordial e profissional. Vá direto ao ponto, sem parecer frio, e sempre termine indicando o próximo passo.");
  });
  it("inclui regras somente no prompt do rascunho e não altera o objeto salvo", () => {
    const config = Object.freeze({ name: "Lia", prompt_template: "support_minimal" as const, regras_da_casa: "Não prometa descontos." });
    const prompt = promptDoRascunho(config, { display_name: "Negócio QA", o_que_faz: null });
    expect(prompt).toBe("Você atende os clientes de Negócio QA. Responda em frases curtas, peça apenas o que for necessário e chame uma pessoa do time assim que a dúvida sair do seu alcance.\n\nRegras deste rascunho:\nNão prometa descontos.");
  });
  it("não trunca regras para caber na versão", () => {
    expect(() => promptDoRascunho({ name: "Lia", prompt_template: "support_minimal", regras_da_casa: "x".repeat(20000) }, { display_name: "QA", o_que_faz: null })).toThrow("draft_prompt_too_long");
  });
});
