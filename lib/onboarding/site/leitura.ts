import { assertDestinoResolvidoSeguro } from "@/lib/automation/outbound-ip";
import { assertSafeOutboundUrl } from "@/lib/automation/outbound-url";
import {
  extrairPaginaDoSite,
  LIMITE_PERGUNTAS_DO_SITE,
  LIMITE_PRODUTOS_DO_SITE,
  LIMITE_RECUSAS_DO_SITE,
  type PerguntaDoSite,
  type ProdutoDoSite,
  type RecusaDoSite,
} from "./extracao";
import { normalizarSiteDoNegocio } from "./url";

/** Uma leitura de onboarding, não um indexador da loja inteira: home + cinco
 * páginas úteis. Redirecionamento/falha também gasta tentativa; nenhum site
 * pode multiplicar o custo gerando links/redirects sem conteúdo. */
export const LIMITES_LEITURA_SITE = {
  paginas: 6,
  redirecionamentos: 2,
  tempoTotalMs: 30_000,
  tempoRequisicaoMs: 6_000,
  bytesPorPagina: 512 * 1_024,
  bytesTotal: 2 * 1_024 * 1_024,
  caracteresResumo: 20_000,
} as const;

export interface LeituraDoSite {
  status: "success" | "partial" | "failed";
  /** Conteúdo externo NÃO CONFIÁVEL. O consumidor não o promove a instrução. */
  resumo: string;
  paginasLidas: number;
  limiteAtingido: boolean;
  produtos: ProdutoDoSite[];
  perguntas: PerguntaDoSite[];
  recusas: RecusaDoSite[];
  motivo?: string;
}

interface Orcamento {
  tentativas: number;
  bytes: number;
  fim: number;
  limiteAtingido: boolean;
}
type Pagina = { url: string; html: string };

function falha(motivo: string): LeituraDoSite {
  return {
    status: "failed",
    resumo: "",
    paginasLidas: 0,
    limiteAtingido: false,
    produtos: [],
    perguntas: [],
    recusas: [],
    motivo,
  };
}

function cancelar(resposta: Response): void {
  // Cancelar nunca segura a fila: um servidor hostil pode nem concluir close.
  void resposta.body?.cancel().catch(() => undefined);
}

async function lerCorpo(
  resposta: Response,
  orcamento: Orcamento,
  signal: AbortSignal,
): Promise<string> {
  const tamanho = Number(resposta.headers.get("content-length"));
  if (
    Number.isFinite(tamanho) &&
    (tamanho > LIMITES_LEITURA_SITE.bytesPorPagina ||
      tamanho + orcamento.bytes > LIMITES_LEITURA_SITE.bytesTotal)
  ) {
    orcamento.limiteAtingido = true;
    cancelar(resposta);
    throw new Error("site_limite_de_tamanho");
  }
  if (!resposta.body) return "";
  const leitor = resposta.body.getReader();
  const cancelarLeitura = () => {
    void leitor.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancelarLeitura, { once: true });
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = "";
  try {
    while (true) {
      signal.throwIfAborted();
      const parte = await leitor.read();
      if (parte.done) break;
      bytes += parte.value.byteLength;
      orcamento.bytes += parte.value.byteLength;
      if (
        bytes > LIMITES_LEITURA_SITE.bytesPorPagina ||
        orcamento.bytes > LIMITES_LEITURA_SITE.bytesTotal
      ) {
        orcamento.limiteAtingido = true;
        cancelarLeitura();
        throw new Error("site_limite_de_tamanho");
      }
      html += decoder.decode(parte.value, { stream: true });
    }
    signal.throwIfAborted();
    return html + decoder.decode();
  } finally {
    signal.removeEventListener("abort", cancelarLeitura);
    leitor.releaseLock();
  }
}

async function requisitar(
  url: string,
  orcamento: Orcamento,
): Promise<{ resposta: Response; html: string }> {
  const restante = orcamento.fim - Date.now();
  if (restante <= 0 || orcamento.tentativas >= LIMITES_LEITURA_SITE.paginas) {
    orcamento.limiteAtingido = true;
    throw new Error("site_limite_de_leitura");
  }
  orcamento.tentativas++;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => {
        controller.abort();
        reject(new Error("site_tempo_limite"));
      },
      Math.min(restante, LIMITES_LEITURA_SITE.tempoRequisicaoMs),
    );
  });
  try {
    return await Promise.race([
      prazo,
      (async () => {
        // Ordem canônica de call-webhook. Repete em CADA requisição e redirect;
        // validar apenas a home deixaria o destino seguinte alcançar a intranet.
        assertSafeOutboundUrl(url);
        await assertDestinoResolvidoSeguro(new URL(url).hostname);
        controller.signal.throwIfAborted();
        const resposta = await fetch(url, {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          cache: "no-store",
          headers: { Accept: "text/html, application/xhtml+xml", "User-Agent": "SiteReader/1.0" },
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          cancelar(resposta);
          throw new Error("site_tempo_limite");
        }
        if (resposta.status >= 300 && resposta.status < 400) {
          cancelar(resposta);
          return { resposta, html: "" };
        }
        if (!resposta.ok) {
          cancelar(resposta);
          throw new Error("site_indisponivel");
        }
        const tipo = resposta.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
        if (tipo !== "text/html" && tipo !== "application/xhtml+xml") {
          cancelar(resposta);
          throw new Error("site_conteudo_nao_html");
        }
        return { resposta, html: await lerCorpo(resposta, orcamento, controller.signal) };
      })(),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function obterPagina(
  inicial: string,
  orcamento: Orcamento,
  origem: string | null,
): Promise<Pagina> {
  let atual = inicial;
  const vistos = new Set<string>();
  for (let salto = 0; salto <= LIMITES_LEITURA_SITE.redirecionamentos; salto++) {
    if (vistos.has(atual)) throw new Error("site_redirecionamento_circular");
    vistos.add(atual);
    // Normalizador também recusa rede social e URL com senha nos redirects.
    const normal = normalizarSiteDoNegocio(atual);
    if (!normal.ok || !normal.url) throw new Error(normal.ok ? "site_url_invalida" : normal.motivo);
    atual = normal.url;
    if (origem && new URL(atual).origin !== origem)
      throw new Error("site_redirecionamento_externo");
    const { resposta, html } = await requisitar(atual, orcamento);
    if (resposta.status < 300 || resposta.status >= 400) return { url: atual, html };
    const destino = resposta.headers.get("location");
    if (!destino) throw new Error("site_redirecionamento_invalido");
    if (salto === LIMITES_LEITURA_SITE.redirecionamentos) {
      orcamento.limiteAtingido = true;
      throw new Error("site_limite_de_redirecionamentos");
    }
    try {
      atual = new URL(destino, atual).href;
    } catch {
      throw new Error("site_redirecionamento_invalido");
    }
  }
  throw new Error("site_limite_de_redirecionamentos");
}

function motivoDaFalha(erro: unknown): string {
  const mensagem =
    erro !== null && typeof erro === "object" && "message" in erro ? String(erro.message) : "";
  // Nunca devolve conteúdo de resposta, stack, endereço interno resolvido ou
  // mensagem arbitrária da rede ao estado visível do onboarding.
  if (mensagem.startsWith("unsafe_url:")) return "site_destino_inseguro";
  return /^site_[a-z_]+$/.test(mensagem) ? mensagem : "site_indisponivel";
}

export async function lerSite(bruto: string): Promise<LeituraDoSite> {
  const normal = normalizarSiteDoNegocio(bruto);
  if (!normal.ok) return falha(normal.motivo);
  if (!normal.url) return falha("site_nao_informado");
  const orcamento: Orcamento = {
    tentativas: 0,
    bytes: 0,
    fim: Date.now() + LIMITES_LEITURA_SITE.tempoTotalMs,
    limiteAtingido: false,
  };
  const resultado: LeituraDoSite = {
    status: "success",
    resumo: "",
    paginasLidas: 0,
    limiteAtingido: false,
    produtos: [],
    perguntas: [],
    recusas: [],
  };
  const fila = [normal.url];
  const vistos = new Set(fila);
  const produtos = new Map<string, ProdutoDoSite>();
  const produtosConflitantes = new Set<string>();
  const perguntas = new Set<string>();
  let origem: string | null = null;
  for (let i = 0; i < fila.length; i++) {
    if (orcamento.tentativas >= LIMITES_LEITURA_SITE.paginas || Date.now() >= orcamento.fim) {
      orcamento.limiteAtingido = true;
      break;
    }
    const alvo = fila[i]!;
    try {
      const pagina = await obterPagina(alvo, orcamento, origem);
      origem ??= new URL(pagina.url).origin;
      vistos.add(pagina.url);
      const dados = extrairPaginaDoSite(pagina.html, pagina.url);
      if (dados.texto.length < 40 && !dados.produtos.length && !dados.perguntas.length)
        throw new Error("site_sem_conteudo_legivel");
      resultado.paginasLidas++;
      const resumo = `${resultado.resumo}${resultado.resumo ? "\n\n" : ""}${dados.texto}`;
      if (resumo.length > LIMITES_LEITURA_SITE.caracteresResumo) orcamento.limiteAtingido = true;
      resultado.resumo = resumo.slice(0, LIMITES_LEITURA_SITE.caracteresResumo);
      for (const produto of dados.produtos) {
        if (produtosConflitantes.has(produto.codigo)) continue;
        const anterior = produtos.get(produto.codigo);
        if (anterior) {
          if (anterior.preco_cents !== produto.preco_cents || anterior.moeda !== produto.moeda) {
            produtosConflitantes.add(produto.codigo);
            resultado.produtos = resultado.produtos.filter(
              (item) => item.codigo !== produto.codigo,
            );
            if (resultado.recusas.length < LIMITE_RECUSAS_DO_SITE)
              resultado.recusas.push({
                url: produto.url,
                linha: 0,
                item: produto.nome,
                motivo: "site_preco_conflitante",
              });
          }
          continue;
        }
        if (resultado.produtos.length >= LIMITE_PRODUTOS_DO_SITE) {
          orcamento.limiteAtingido = true;
          break;
        }
        produtos.set(produto.codigo, produto);
        resultado.produtos.push(produto);
      }
      for (const pergunta of dados.perguntas) {
        if (perguntas.has(pergunta.pergunta)) continue;
        if (resultado.perguntas.length >= LIMITE_PERGUNTAS_DO_SITE) {
          orcamento.limiteAtingido = true;
          break;
        }
        perguntas.add(pergunta.pergunta);
        resultado.perguntas.push(pergunta);
      }
      resultado.recusas.push(
        ...dados.recusas.slice(0, Math.max(0, LIMITE_RECUSAS_DO_SITE - resultado.recusas.length)),
      );
      for (const href of dados.links) {
        let url: URL;
        try {
          url = new URL(href, pagina.url);
        } catch {
          continue;
        }
        url.hash = "";
        if (url.origin !== origem || vistos.has(url.href)) continue;
        vistos.add(url.href);
        fila.push(url.href);
        // Um candidato além do teto prova que sobrou conteúdo sem manter uma
        // fila de milhares de URLs ou abrir novos pedidos.
        if (fila.length > LIMITES_LEITURA_SITE.paginas) break;
      }
    } catch (erro) {
      const motivo = motivoDaFalha(erro);
      resultado.motivo ??= motivo;
      if (resultado.recusas.length < LIMITE_RECUSAS_DO_SITE)
        resultado.recusas.push({ url: alvo, linha: 0, motivo });
    }
  }
  resultado.limiteAtingido = orcamento.limiteAtingido;
  resultado.status =
    resultado.paginasLidas === 0 ? "failed" : resultado.recusas.length ? "partial" : "success";
  return resultado;
}
