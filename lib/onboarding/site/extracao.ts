import { createHash } from "node:crypto";
import { precoParaCentavos } from "@/lib/schemas/produtos";

export interface ProdutoDoSite {
  codigo: string;
  nome: string;
  preco_cents: number;
  moeda: string;
  descricao?: string;
  url: string;
}

export interface PerguntaDoSite {
  pergunta: string;
  resposta: string;
  url: string;
}
export interface RecusaDoSite {
  url: string;
  linha: number;
  motivo: string;
  item?: string;
}
export interface ExtracaoDaPagina {
  texto: string;
  links: string[];
  produtos: ProdutoDoSite[];
  perguntas: PerguntaDoSite[];
  recusas: RecusaDoSite[];
}

export const LIMITE_PRODUTOS_DO_SITE = 100;
export const LIMITE_PERGUNTAS_DO_SITE = 50;
export const LIMITE_RECUSAS_DO_SITE = 120;
const MAX_NOS_ESTRUTURADOS = 2_000;
const MAX_TEXTO_DA_PAGINA = 12_000;

/** Texto, nunca HTML executável; scripts (inclusive instruções) não viram resumo. */
function textoDeHtml(html: string): string {
  return decodificarEntidades(
    html
      .replace(/<!--[^]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|svg)\b[^>]*>[^]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodificarEntidades(texto: string): string {
  const entidades: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return texto.replace(
    /&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
    (original, chave: string) => {
      if (!chave.startsWith("#")) return entidades[chave.toLowerCase()] ?? original;
      const n =
        chave[1]?.toLowerCase() === "x" ? parseInt(chave.slice(2), 16) : Number(chave.slice(1));
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
        ? String.fromCodePoint(n)
        : " ";
    },
  );
}

function atributo(tag: string, nome: string): string | null {
  const resultado = new RegExp(
    `(?:^|\\s)${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  ).exec(tag);
  const valor = resultado?.[1] ?? resultado?.[2] ?? resultado?.[3];
  return valor === undefined ? null : decodificarEntidades(valor);
}

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

function temTipo(valor: Record<string, unknown>, tipo: string): boolean {
  const tipos = Array.isArray(valor["@type"]) ? valor["@type"] : [valor["@type"]];
  return tipos.some(
    (item) => typeof item === "string" && item.replace(/^https?:\/\/schema\.org\//, "") === tipo,
  );
}

function textoCurto(valor: unknown, max: number): string {
  return typeof valor === "string" ? textoDeHtml(valor).slice(0, max) : "";
}

/** Os formatos aceitos pela planilha continuam; sujeira e múltiplos preços não. */
function lerPreco(valor: unknown): number | null {
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  if (
    typeof valor === "number" &&
    (!Number.isFinite(valor) ||
      valor < 0 ||
      Math.abs(valor * 100 - Math.round(valor * 100)) > 0.000001)
  )
    return null;
  const texto = String(valor)
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/^R\$\s*/i, "");
  if (
    !/^(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?)$/.test(
      texto,
    )
  )
    return null;
  const centavos = precoParaCentavos(texto);
  return centavos !== null && Number.isSafeInteger(centavos) && centavos >= 0 ? centavos : null;
}

function criarProduto(
  dados: Record<string, unknown>,
  url: string,
): { produto?: ProdutoDoSite; motivo?: string } {
  const nome = textoCurto(dados.name, 200);
  if (nome.length < 2) return { motivo: "site_produto_sem_nome" };
  const ofertas = Array.isArray(dados.offers) ? dados.offers : [dados.offers];
  const oferta = objeto(ofertas[0]);
  if (
    ofertas.length !== 1 ||
    !oferta ||
    temTipo(oferta, "AggregateOffer") ||
    oferta.lowPrice !== undefined ||
    oferta.highPrice !== undefined
  ) {
    return { motivo: "site_preco_ambiguo" };
  }
  const preco = lerPreco(oferta.price);
  if (preco === null) return { motivo: "site_preco_ambiguo" };
  const moeda =
    typeof oferta.priceCurrency === "string" ? oferta.priceCurrency.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(moeda)) return { motivo: "site_moeda_ausente" };
  // Código próprio e estável: não sobrescreve um SKU manual já confirmado.
  const chave = textoCurto(dados.sku, 200) || textoCurto(dados["@id"], 200) || nome;
  const codigo = `site-${createHash("sha256")
    .update(`${new URL(url).origin}\n${chave}`)
    .digest("hex")
    .slice(0, 24)}`;
  const descricao = textoCurto(dados.description, 2_000);
  return {
    produto: { codigo, nome, preco_cents: preco, moeda, ...(descricao ? { descricao } : {}), url },
  };
}

/** Não busca dependências do JSON-LD, não executa JS e não infere preço por IA. */
export function extrairPaginaDoSite(html: string, url: string): ExtracaoDaPagina {
  const produtos: ProdutoDoSite[] = [];
  const perguntas: PerguntaDoSite[] = [];
  const recusas: RecusaDoSite[] = [];
  const links: string[] = [];
  const recusar = (indice: number, motivo: string, item?: string) => {
    if (recusas.length < LIMITE_RECUSAS_DO_SITE)
      recusas.push({
        url,
        linha: html.slice(0, indice).split("\n").length,
        motivo,
        ...(item ? { item } : {}),
      });
  };
  const adicionarProduto = (dados: Record<string, unknown>, indice: number) => {
    if (produtos.length >= LIMITE_PRODUTOS_DO_SITE) return;
    const resultado = criarProduto(dados, url);
    if (resultado.produto) produtos.push(resultado.produto);
    else recusar(indice, resultado.motivo ?? "site_preco_ambiguo", textoCurto(dados.name, 200));
  };
  const adicionarPergunta = (pergunta: unknown, resposta: unknown) => {
    const titulo = textoCurto(pergunta, 500);
    const texto = textoCurto(resposta, 3_000);
    if (titulo && texto && perguntas.length < LIMITE_PERGUNTAS_DO_SITE)
      perguntas.push({ pergunta: titulo, resposta: texto, url });
  };

  for (const script of html.matchAll(/<script\b([^>]*)>([^]*?)<\/script\s*>/gi)) {
    if (atributo(script[1] ?? "", "type")?.toLowerCase() !== "application/ld+json") continue;
    let raiz: unknown;
    try {
      raiz = JSON.parse(script[2] ?? "");
    } catch {
      recusar(script.index, "site_dados_estruturados_invalidos");
      continue;
    }
    const fila: unknown[] = [raiz];
    for (let i = 0; i < fila.length && i < MAX_NOS_ESTRUTURADOS; i++) {
      const valor = fila[i];
      if (Array.isArray(valor)) {
        fila.push(...valor.slice(0, MAX_NOS_ESTRUTURADOS - fila.length));
        continue;
      }
      const dados = objeto(valor);
      if (!dados) continue;
      if (temTipo(dados, "Product")) adicionarProduto(dados, script.index);
      if (temTipo(dados, "FAQPage")) {
        const questoes = Array.isArray(dados.mainEntity) ? dados.mainEntity : [dados.mainEntity];
        for (const questao of questoes.slice(0, LIMITE_PERGUNTAS_DO_SITE)) {
          const item = objeto(questao);
          const resposta = objeto(item?.acceptedAnswer);
          if (item && temTipo(item, "Question") && resposta)
            adicionarPergunta(item.name, resposta.text);
        }
      }
      for (const filho of Object.values(dados)) {
        if (filho !== null && typeof filho === "object" && fila.length < MAX_NOS_ESTRUTURADOS)
          fila.push(filho);
      }
    }
  }

  // Microdata: só um contêiner Product explícito. HTML arbitrário com dois
  // preços na tela nunca é convertido em uma oferta inventada.
  const elementos = elementosFechados(html);
  for (const elemento of elementos) {
    if (
      atributo(elemento.tag, "itemtype")
        ?.split(/\s+/)
        .some((tipo) => /^https?:\/\/schema\.org\/Product$/.test(tipo))
    ) {
      const campo = (nome: string): string[] => {
        const valores: string[] = [];
        for (const filho of elementos) {
          if (filho.inicio <= elemento.inicio || filho.fim > elemento.fim) continue;
          if (atributo(filho.tag, "itemprop")?.split(/\s+/).includes(nome)) {
            valores.push(
              atributo(filho.tag, "content") ??
                textoDeHtml(html.slice(filho.conteudo, filho.fimConteudo)),
            );
          }
        }
        return valores;
      };
      const precos = campo("price");
      adicionarProduto(
        {
          name: campo("name")[0],
          sku: campo("sku")[0],
          description: campo("description")[0],
          offers: precos.map((price) => ({ price, priceCurrency: campo("priceCurrency")[0] })),
        },
        elemento.inicio,
      );
    }
    if (elemento.nome === "details") {
      const trecho = html.slice(elemento.conteudo, elemento.fimConteudo);
      const resumo = /<summary\b[^>]*>([^]*?)<\/summary\s*>/i.exec(trecho);
      if (resumo && /\?/.test(textoDeHtml(resumo[1] ?? "")))
        adicionarPergunta(resumo[1], trecho.replace(resumo[0], " "));
    }
  }

  // Links descobertos só são candidatos. O leitor ainda impõe mesma origem e
  // executa as duas camadas de proteção antes de cada acesso.
  for (const link of html.matchAll(/<a\b([^>]*)>([^]*?)<\/a\s*>/gi)) {
    const href = atributo(link[1] ?? "", "href");
    if (
      href &&
      /(?:produt|product|servic|serviç|catalog|catálog|sobre|about|contat|contact|faq|d[uú]vida|pergunta|quem.somos)/i.test(
        `${href} ${textoDeHtml(link[2] ?? "")}`,
      )
    )
      links.push(href);
    if (links.length >= 60) break;
  }
  const texto = textoDeHtml(html.replace(/<(head|nav|footer)\b[^>]*>[^]*?<\/\1\s*>/gi, " ")).slice(
    0,
    MAX_TEXTO_DA_PAGINA,
  );
  return { texto, links, produtos, perguntas, recusas };
}

interface Elemento {
  nome: string;
  tag: string;
  inicio: number;
  conteudo: number;
  fimConteudo: number;
  fim: number;
}

/** Tokenização conservadora, limitada pelo teto de bytes; não cria DOM/JS. */
function elementosFechados(html: string): Elemento[] {
  const pilha: Array<Omit<Elemento, "fimConteudo" | "fim">> = [];
  const elementos: Elemento[] = [];
  const vazios = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/;
  for (const token of html.matchAll(
    /<!--[^]*?-->|<(script|style)\b[^>]*>[^]*?<\/\1\s*>|<\/?([a-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*\/?\s*>/gi,
  )) {
    if (!token[2]) continue;
    const nome = token[2].toLowerCase();
    if (token[0].startsWith("</")) {
      const indice = pilha.findLastIndex((item) => item.nome === nome);
      if (indice < 0) continue;
      const aberto = pilha[indice]!;
      pilha.length = indice;
      elementos.push({ ...aberto, fimConteudo: token.index, fim: token.index + token[0].length });
    } else {
      const aberto = {
        nome,
        tag: token[0],
        inicio: token.index,
        conteudo: token.index + token[0].length,
      };
      if (vazios.test(nome) || /\/\s*>$/.test(token[0]))
        elementos.push({ ...aberto, fimConteudo: aberto.conteudo, fim: aberto.conteudo });
      else if (pilha.length < 100) pilha.push(aberto);
    }
    if (elementos.length >= 5_000) break;
  }
  return elementos;
}
