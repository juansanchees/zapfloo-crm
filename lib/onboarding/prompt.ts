import type { PromptTemplate } from "@/lib/schemas/onboarding";
import type { Rascunho } from "./rascunho";

const PROMPT_BODIES: Record<PromptTemplate, (onde: string) => string> = {
  ecommerce_friendly: (n) =>
    `Você atende os clientes de ${n}. Fale de forma calorosa e próxima, como alguém que gosta de ajudar. Cumprimente, entenda o que a pessoa precisa e ofereça opções claras. Confirme os detalhes antes de agir.`,
  ecommerce_professional: (n) =>
    `Você atende os clientes de ${n}. Fale de forma objetiva, cordial e profissional. Vá direto ao ponto, sem parecer frio, e sempre termine indicando o próximo passo.`,
  support_minimal: (n) =>
    `Você atende os clientes de ${n}. Responda em frases curtas, peça apenas o que for necessário e chame uma pessoa do time assim que a dúvida sair do seu alcance.`,
};

/** Mesmo texto legado, sem inferir nicho quando o dono não o informou. */
export function promptDoOnboarding(template: PromptTemplate, negocio: string, oQueFaz?: string): string {
  return PROMPT_BODIES[template](oQueFaz ? `${negocio}, que é: ${oQueFaz}` : negocio);
}

/** Regras em ensaio pertencem à versão, não à memória compartilhada ativa. */
export function promptDoRascunho(configuration: Rascunho["configuration"], business: { display_name: string; o_que_faz: string | null }): string {
  const base = promptDoOnboarding(configuration.prompt_template, business.display_name, business.o_que_faz ?? undefined);
  const prompt = configuration.regras_da_casa.trim()
    ? `${base}\n\nRegras deste rascunho:\n${configuration.regras_da_casa}` : base;
  if (prompt.length > 20000) throw new Error("draft_prompt_too_long");
  return prompt;
}
