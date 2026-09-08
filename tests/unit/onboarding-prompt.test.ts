import { describe, expect, it } from "vitest";
import { promptDoOnboarding, promptDoRascunho } from "@/lib/onboarding/prompt";

describe("prompt do onboarding", () => {
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
