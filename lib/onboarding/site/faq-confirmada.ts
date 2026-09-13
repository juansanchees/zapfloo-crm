import { createHash } from "node:crypto";

/** Selo do conteúdo exato conferido; uma edição concorrente não herda aprovação. */
export function hashPerguntasDoSite(
  itens: readonly { question: string; answer: string }[],
): string {
  return createHash("sha256")
    .update(JSON.stringify(itens.map(({ question, answer }) => ({ question, answer }))))
    .digest("hex");
}
