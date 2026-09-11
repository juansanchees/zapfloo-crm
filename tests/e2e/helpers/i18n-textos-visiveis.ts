/** Autocontido: Playwright serializa esta função para executá-la no documento. */
export function coletarTextosVisiveis(): string[] {
  const saida: string[] = [];
  const anda = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let no = anda.nextNode(); no; no = anda.nextNode()) {
    const texto = (no.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!texto) continue;
    const pai = no.parentElement;
    if (!pai) continue;
    const estilo = getComputedStyle(pai);
    if (estilo.display === "none" || estilo.visibility === "hidden") continue;
    if (pai.closest("script,style,noscript")) continue;
    // A inicial do cartão da empresa é dado derivado, não uma palavra da UI.
    // Não ignorar aria-hidden em geral: texto visível ao operador ainda conta.
    // A cerca exige o cartão concreto (nome + rótulo), a inicial correspondente
    // e o span decorativo na sidebar. Nome completo e rótulo seguem na coleta.
    const identidade = pai.nextElementSibling;
    const nome = (identidade?.firstElementChild?.textContent ?? "").trim();
    const rotulo = (identidade?.lastElementChild?.textContent ?? "").trim();
    const inicialDaEmpresa =
      pai.matches('span[aria-hidden="true"]') &&
      pai.children.length === 0 &&
      pai.closest("aside") !== null &&
      identidade?.matches("span") &&
      identidade.children.length === 2 &&
      (rotulo === "Sua empresa" || rotulo === "Tu empresa") &&
      [...nome].length > 1 &&
      [...texto].length === 1 &&
      texto === [...nome][0]?.toUpperCase();
    if (inicialDaEmpresa) continue;
    saida.push(texto);
  }
  return saida;
}
