import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { ORIGEM_SITE } from "@/lib/catalogo/tipos";
import { lerEstadoDoSite, type EstadoDoSite } from "./estado";
import { lerSite } from "./leitura";
import { normalizarSiteDoNegocio } from "./url";

/** O after acelera; o JSON persistido + cron garantem a retomada após reinício.
 * O lease cobre mais que os 30s do leitor. Compare-and-swap evita duas leituras
 * quando after e cron encontram a mesma fonte. Nada é indexado automaticamente. */
const LEASE_MS = 90_000;
const MAX_TENTATIVAS = 3;
const LOTE_DE_LEITURA = 2;

type JsonObject = Record<string, unknown>;
interface Fonte {
  id: string;
  organization_id: string;
  status: string;
  is_active: boolean;
  last_index_status: string | null;
  source_metadata: JsonObject;
}

function objeto(valor: unknown): JsonObject {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? valor as JsonObject : {};
}

function idEstavel(texto: string): string {
  const h = createHash("sha256").update(texto).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function idDaFonteDoSite(orgId: string, url: string): string {
  return idEstavel(`onboarding-site:${orgId}:${url}`);
}

async function negocio(orgId: string) {
  const { data, error } = await createAdminClient().from("organizations")
    .select("id,onboarding_state").eq("id", orgId).eq("status", "active")
    .is("suspended_at", null).is("redacted_at", null).maybeSingle();
  if (error) throw new Error("site_estado_indisponivel");
  if (!data) return null;
  const state = objeto(data.onboarding_state);
  const welcome = objeto(state.welcome);
  const normalizado = normalizarSiteDoNegocio(typeof welcome.site_do_negocio === "string" ? welcome.site_do_negocio : "");
  return { state, welcome, url: normalizado.ok ? normalizado.url : null };
}

async function fonteDaOrg(orgId: string, id: string): Promise<Fonte | null> {
  const { data, error } = await createAdminClient().from("ai_knowledge_sources")
    .select("id,organization_id,status,is_active,last_index_status,source_metadata")
    .eq("organization_id", orgId).eq("id", id).eq("source_type", "site").maybeSingle();
  if (error) throw new Error("site_fonte_indisponivel");
  return data as Fonte | null;
}

/** Somente grava a fila. Nunca faz rede para o endereço do negócio. */
export async function enfileirarSiteDoNegocio(orgId: string, bruto: string): Promise<string | null> {
  const normalizado = normalizarSiteDoNegocio(bruto);
  if (!normalizado.ok || !normalizado.url) return null;
  const url = normalizado.url;
  const atual = await negocio(orgId);
  if (!atual || atual.url !== url) return null;
  const id = idDaFonteDoSite(orgId, url);
  const site: EstadoDoSite = {
    url, resumo: "", paginasLidas: 0, limiteAtingido: false, recusas: [],
    tentativas: 0, inicio: null, concluidaEm: null,
  };
  // Identidade determinística + DO NOTHING: não apaga leitura nem revisão de
  // quem voltou à tela; tampouco nasce fonte duplicada em dois processos.
  const { error } = await createAdminClient().from("ai_knowledge_sources").upsert({
    id, organization_id: orgId, agent_id: null, source_type: "site",
    name: `Site do negócio · ${new URL(url).hostname}`.slice(0, 120),
    is_active: false, status: "building", last_index_status: null,
    source_metadata: { site },
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error("site_fila_indisponivel");

  // A confirmação só vem DEPOIS da fonte durável. Se o wizard avançou entre
  // ler e gravar, o CAS não casa; o próximo cron repete sem perder progresso.
  if (atual.welcome.site_leitura_pendente === true) {
    const { error: ackError } = await createAdminClient().from("organizations")
      .update({ onboarding_state: { ...atual.state, welcome: { ...atual.welcome, site_leitura_pendente: false } } })
      .eq("id", orgId).eq("onboarding_state", JSON.stringify(atual.state))
      .eq("status", "active").is("suspended_at", null).is("redacted_at", null);
    if (ackError) logger.warn("onboarding.site_ack_pendente", { organizationId: orgId });
  }
  return id;
}

async function mudarFonte(fonte: Fonte, patch: JsonObject): Promise<boolean> {
  const { data, error } = await createAdminClient().from("ai_knowledge_sources")
    .update(patch).eq("organization_id", fonte.organization_id).eq("id", fonte.id)
    .eq("source_type", "site").eq("status", fonte.status).eq("is_active", false)
    .eq("source_metadata", JSON.stringify(fonte.source_metadata)).select("id").maybeSingle();
  if (error) throw new Error("site_gravacao_indisponivel");
  return Boolean(data);
}

async function processarFonte(orgId: string, sourceId: string): Promise<boolean> {
  const fonte = await fonteDaOrg(orgId, sourceId);
  if (!fonte || fonte.status !== "building" || fonte.is_active) return false;
  const estado = lerEstadoDoSite(fonte.source_metadata);
  if (!estado) {
    await mudarFonte(fonte, { status: "failed", last_index_status: "failed", last_index_error: "site_estado_invalido" });
    return false;
  }
  // A revisão humana reserva a MESMA fonte. O cron nunca a interpreta como
  // uma leitura abandonada: só a própria edição pode retomar essa reserva.
  if (objeto(fonte.source_metadata.site).revisaoToken) return false;
  if (estado.inicio && Date.now() - Date.parse(estado.inicio) < LEASE_MS) return false;
  if (estado.tentativas >= MAX_TENTATIVAS) {
    await mudarFonte(fonte, { status: "failed", last_index_status: "failed", last_index_error: "site_tentativas_esgotadas" });
    return false;
  }
  const empresa = await negocio(orgId);
  if (!empresa || empresa.url !== estado.url) {
    await mudarFonte(fonte, { status: "failed", last_index_status: "failed", last_index_error: "site_endereco_alterado" });
    return false;
  }
  const iniciado: EstadoDoSite = { ...estado, tentativas: estado.tentativas + 1, inicio: new Date().toISOString() };
  const metadata = { ...fonte.source_metadata, site: iniciado };
  const claimed = await mudarFonte(fonte, {
    last_index_status: "indexando", last_index_error: null, source_metadata: metadata,
  });
  if (!claimed) return false;
  const emLeitura = { ...fonte, source_metadata: metadata };
  try {
    const resultado = await lerSite(estado.url);
    // Revalida após I/O: uma organização suspensa ou um material arquivado não
    // ganha conteúdo por uma leitura iniciada antes da decisão.
    const [aindaEmpresa, aindaFonte] = await Promise.all([negocio(orgId), fonteDaOrg(orgId, sourceId)]);
    if (!aindaEmpresa || aindaEmpresa.url !== estado.url || aindaFonte?.status !== "building" || aindaFonte.is_active) return false;
    const reservaAtual = lerEstadoDoSite(aindaFonte.source_metadata);
    if (reservaAtual?.inicio !== iniciado.inicio || reservaAtual.tentativas !== iniciado.tentativas) return false;
    const admin = createAdminClient();
    if (resultado.produtos.length) {
      const { error } = await admin.from("catalog_products").upsert(resultado.produtos.map((p) => ({
        organization_id: orgId, codigo: p.codigo, nome: p.nome, descricao: p.descricao ?? null,
        preco_cents: p.preco_cents, moeda: p.moeda, origem: ORIGEM_SITE,
        ativo: false, controla_estoque: false,
      })), { onConflict: "organization_id,codigo", ignoreDuplicates: true });
      if (error) throw new Error("site_produtos_nao_gravados");
    }
    if (resultado.perguntas.length) {
      const { error } = await admin.from("ai_faq_items").upsert(resultado.perguntas.map((p, position) => ({
        id: idEstavel(`${sourceId}:faq:${p.pergunta}`), organization_id: orgId,
        knowledge_source_id: sourceId, question: p.pergunta, answer: p.resposta, position,
      })), { onConflict: "id", ignoreDuplicates: true });
      if (error) throw new Error("site_perguntas_nao_gravadas");
    }
    const concluidaEm = new Date().toISOString();
    const final: EstadoDoSite = {
      ...iniciado, resumo: resultado.resumo, paginasLidas: resultado.paginasLidas,
      limiteAtingido: resultado.limiteAtingido, recusas: resultado.recusas,
      motivo: resultado.motivo, concluidaEm,
      produtos: resultado.produtos.length, perguntas: resultado.perguntas.length,
    };
    const mudou = await mudarFonte(emLeitura, {
      status: resultado.status === "failed" ? "failed" : "ready",
      last_index_status: resultado.status, last_index_error: resultado.motivo ?? null,
      ingested_at: concluidaEm, source_metadata: { ...metadata, site: final },
    });
    if (mudou) await audit({
      action: "knowledge_source.updated", organizationId: orgId, resourceType: "ai_knowledge_source",
      resourceId: sourceId, bypassedRls: true,
      metadata: { operation: "onboarding_site_read", status: resultado.status,
        pages: resultado.paginasLidas, products: resultado.produtos.length, faqs: resultado.perguntas.length,
        rejected: resultado.recusas.length, capped: resultado.limiteAtingido },
    });
    return mudou;
  } catch {
    // Não guardar mensagem de fetch/DB: pode conter URL com query sensível ou
    // o texto de um produto. A fonte mostra um motivo estável e permite retry.
    await mudarFonte(emLeitura, {
      status: "failed", last_index_status: "failed", last_index_error: "site_gravacao_indisponivel",
      source_metadata: { ...metadata, site: { ...iniciado, motivo: "site_gravacao_indisponivel", concluidaEm: new Date().toISOString() } },
    });
    return false;
  }
}

/** Chamado somente com org de guard servidor ou da seleção restrita do cron. */
export async function processarSiteDaOrganizacao(orgId: string): Promise<void> {
  try {
    const empresa = await negocio(orgId);
    if (!empresa?.url) return;
    const id = await enfileirarSiteDoNegocio(orgId, empresa.url);
    if (id) await processarFonte(orgId, id);
  } catch {
    // O marcador durável/lease continua para a próxima rodada.
    logger.error("onboarding.site_leitura_pendente", { organizationId: orgId });
  }
}

export async function recuperarLeiturasDoSite(): Promise<{ enfileiradas: number; processadas: number }> {
  const admin = createAdminClient();
  const { data: pendentes, error } = await admin.from("organizations").select("id,onboarding_state")
    .eq("status", "active").is("suspended_at", null).is("redacted_at", null)
    .contains("onboarding_state", { welcome: { site_leitura_pendente: true } }).limit(10);
  if (error) throw new Error("site_fila_indisponivel");
  let enfileiradas = 0;
  for (const org of pendentes ?? []) {
    const welcome = objeto(objeto(org.onboarding_state).welcome);
    if (typeof welcome.site_do_negocio === "string" && await enfileirarSiteDoNegocio(org.id, welcome.site_do_negocio)) enfileiradas++;
  }
  const { data: fontes, error: filaError } = await admin.from("ai_knowledge_sources")
    .select("id,organization_id").eq("source_type", "site").eq("status", "building").eq("is_active", false)
    .is("source_metadata->site->>revisaoToken", null)
    .order("updated_at", { ascending: true }).limit(LOTE_DE_LEITURA);
  if (filaError) throw new Error("site_fila_indisponivel");
  const resultados = await Promise.all((fontes ?? []).map((f) => processarFonte(f.organization_id, f.id)));
  return { enfileiradas, processadas: resultados.filter(Boolean).length };
}

export async function reenfileirarSite(orgId: string, sourceId: string): Promise<boolean> {
  const fonte = await fonteDaOrg(orgId, sourceId);
  const estado = lerEstadoDoSite(fonte?.source_metadata);
  if (!fonte || fonte.status !== "failed" || fonte.is_active || !estado || estado.tentativas >= MAX_TENTATIVAS) return false;
  const empresa = await negocio(orgId);
  if (!empresa || empresa.url !== estado.url) return false;
  return mudarFonte(fonte, { status: "building", last_index_status: null, last_index_error: null,
    source_metadata: { ...fonte.source_metadata, site: { ...estado, inicio: null, concluidaEm: null } } });
}

/** Snapshot: nunca inicia nem aguarda crawling/embeddings/modelo. */
export async function lerContextoDoSite(orgId: string): Promise<{ endereco: string; resumo: string } | null> {
  try {
    const empresa = await negocio(orgId);
    if (!empresa?.url) return null;
    const fonte = await fonteDaOrg(orgId, idDaFonteDoSite(orgId, empresa.url));
    const estado = lerEstadoDoSite(fonte?.source_metadata);
    return fonte?.status === "ready" && estado?.concluidaEm && estado.resumo.trim()
      ? { endereco: estado.url, resumo: estado.resumo } : null;
  } catch { return null; }
}

export async function lerPendenciasDoSite(orgId: string): Promise<{ produtos: number; perguntas: number; fonteId: string | null }> {
  const vazio = { produtos: 0, perguntas: 0, fonteId: null };
  try {
    const empresa = await negocio(orgId);
    if (!empresa?.url) return vazio;
    const fonte = await fonteDaOrg(orgId, idDaFonteDoSite(orgId, empresa.url));
    const admin = createAdminClient();
    const { count: produtos, error } = await admin.from("catalog_products").select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("origem", ORIGEM_SITE).eq("ativo", false);
    if (error) return vazio;
    const podeRevisar = fonte?.status === "ready" && !fonte.is_active;
    const { count: perguntas, error: faqError } = podeRevisar
      ? await admin.from("ai_faq_items").select("id", { count: "exact", head: true })
        .eq("organization_id", orgId).eq("knowledge_source_id", fonte.id)
      : { count: 0, error: null };
    return { produtos: produtos ?? 0, perguntas: faqError ? 0 : perguntas ?? 0,
      fonteId: podeRevisar ? fonte.id : null };
  } catch { return vazio; }
}
