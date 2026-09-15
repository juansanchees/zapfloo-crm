/**
 * Contrato oficial: /oauth/access_token e /debug_token são GET. A exceção
 * autorizada de parâmetros sensíveis vale SÓ para este salto HTTPS servidor →
 * provedor. Nunca devolver URL, erro bruto ou token em logs/respostas da rota.
 * https://developers.facebook.com/docs/graph-api/reference/debug_token/
 * https://developers.facebook.com/documentation/facebook-login/guides/advanced/manual-flow
 */
import { suppressTracing } from "@sentry/nextjs";
import { z } from "zod";
import type { ConfigOAuth } from "./config";

export const TEMPO_LIMITE_OAUTH_MS = 10_000;
export const MAXIMO_RESPOSTA_OAUTH_BYTES = 64 * 1024;
export type ErroOAuth =
  | "configuracao_invalida" | "codigo_invalido" | "tempo_esgotado"
  | "falha_de_rede" | "provedor_recusou" | "resposta_invalida"
  | "token_invalido" | "app_incorreto" | "permissao_insuficiente"
  | "token_expirado" | "acesso_expirado";
export type ResultadoOAuth =
  | { ok: true; accessToken: string; tokenType: "USER" | "SYSTEM_USER";
      tokenExpiresAt: string | null; dataAccessExpiresAt: string | null; checkedAt: string }
  | { ok: false; error: ErroOAuth };

class FalhaOAuth extends Error {
  constructor(readonly codigo: ErroOAuth) { super(codigo); }
}

const tokenSchema = z.object({ access_token: z.string().trim().min(1) });
// Zero explícito significa sem vencimento programado. Campo ausente NÃO prova
// isso: recusar uma resposta incompleta evita registrar validade inventada.
const segundos = z.number().int().nonnegative().max(8_640_000_000_000);
const inspecaoSchema = z.object({ data: z.object({
  app_id: z.union([z.string(), z.number().int().nonnegative().safe().transform(String)]),
  is_valid: z.boolean(),
  type: z.enum(["USER", "SYSTEM_USER"]),
  expires_at: segundos,
  data_access_expires_at: segundos,
  scopes: z.array(z.string()),
}) });
type Inspecao = z.infer<typeof inspecaoSchema>["data"];

async function lerLimitado(response: Response): Promise<unknown> {
  const tamanho = Number(response.headers.get("content-length"));
  if (Number.isFinite(tamanho) && tamanho > MAXIMO_RESPOSTA_OAUTH_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new FalhaOAuth("resposta_invalida");
  }
  if (!response.body) throw new FalhaOAuth("resposta_invalida");
  const reader = response.body.getReader();
  const partes: Uint8Array[] = [];
  let recebido = 0;
  try {
    for (;;) {
      const parte = await reader.read();
      if (parte.done) break;
      recebido += parte.value.byteLength;
      if (recebido > MAXIMO_RESPOSTA_OAUTH_BYTES) throw new FalhaOAuth("resposta_invalida");
      partes.push(parte.value);
    }
    const bytes = new Uint8Array(recebido);
    let offset = 0;
    for (const parte of partes) { bytes.set(parte, offset); offset += parte.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new FalhaOAuth("resposta_invalida"); }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function consultar(
  config: ConfigOAuth, caminho: "oauth/access_token" | "debug_token",
  parametros: Record<string, string>, transporte: typeof fetch,
): Promise<unknown> {
  // Não aceita endpoint fornecido por usuário, callback, erro ou paginação.
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${caminho}`);
  url.search = new URLSearchParams(parametros).toString();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await suppressTracing(async () => {
      // No SDK Node instalado, suppressTracing também faz a instrumentação
      // Undici ignorar breadcrumbs, não só spans. next.internal impede ainda
      // o patch do Next de guardar esta URL em fetchMetrics. Teste vigia ambos.
      const init: RequestInit & { next: { internal: true } } = {
        method: "GET", cache: "no-store", credentials: "omit", redirect: "error",
        next: { internal: true }, signal: controller.signal,
        headers: { Accept: "application/json", ...(caminho === "debug_token"
          ? { Authorization: `Bearer ${config.appId}|${config.appSecret}` } : {}) },
      };
      const limite = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new FalhaOAuth("tempo_esgotado"));
        }, TEMPO_LIMITE_OAUTH_MS);
      });
      const chamada = (async () => {
        const response = await transporte(url.href, init);
        if (!response.ok) {
          await response.body?.cancel().catch(() => undefined);
          throw new FalhaOAuth("provedor_recusou");
        }
        return lerLimitado(response);
      })();
      return Promise.race([chamada, limite]);
    });
  } catch (erro) {
    if (erro instanceof FalhaOAuth) throw erro;
    throw new FalhaOAuth(controller.signal.aborted ? "tempo_esgotado" : "falha_de_rede");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function obterToken(resposta: unknown): string {
  const parsed = tokenSchema.safeParse(resposta);
  if (!parsed.success) throw new FalhaOAuth("resposta_invalida");
  return parsed.data.access_token;
}

async function inspecionar(config: ConfigOAuth, token: string, agora: Date, transporte: typeof fetch): Promise<Inspecao> {
  const resposta = await consultar(config, "debug_token", { input_token: token }, transporte);
  const parsed = inspecaoSchema.safeParse(resposta);
  if (!parsed.success) throw new FalhaOAuth("resposta_invalida");
  const dados = parsed.data.data;
  if (dados.app_id !== config.appId) throw new FalhaOAuth("app_incorreto");
  if (!dados.is_valid) throw new FalhaOAuth("token_invalido");
  if (!dados.scopes.includes("ads_read")) throw new FalhaOAuth("permissao_insuficiente");
  if (dados.expires_at !== 0 && dados.expires_at * 1000 <= agora.getTime()) throw new FalhaOAuth("token_expirado");
  if (dados.data_access_expires_at !== 0 && dados.data_access_expires_at * 1000 <= agora.getTime()) throw new FalhaOAuth("acesso_expirado");
  return dados;
}

/** Sem retentativa: o código de autorização é consumível uma única vez. */
export async function trocarEValidarCodigo(
  config: ConfigOAuth, code: string, agora: Date, transporte: typeof fetch = fetch,
): Promise<ResultadoOAuth> {
  if (!/^v\d+\.\d+$/.test(config.graphVersion) || !/^\d+$/.test(config.appId) || !config.appSecret || !Number.isFinite(agora.getTime())) {
    return { ok: false, error: "configuracao_invalida" };
  }
  if (typeof code !== "string" || !code.trim() || code.length > 8192) return { ok: false, error: "codigo_invalido" };
  try {
    let token = obterToken(await consultar(config, "oauth/access_token", {
      client_id: config.appId, client_secret: config.appSecret, redirect_uri: config.redirectUri, code,
    }, transporte));
    let dados = await inspecionar(config, token, agora, transporte);
    // A troca prolongada é de token de USUÁRIO. Nunca reinterpreta SYSTEM_USER
    // como user nem presume 60 dias; debug_token do token FINAL é a autoridade.
    if (dados.type === "USER" && dados.expires_at !== 0) {
      token = obterToken(await consultar(config, "oauth/access_token", {
        client_id: config.appId, client_secret: config.appSecret,
        grant_type: "fb_exchange_token", fb_exchange_token: token,
      }, transporte));
      dados = await inspecionar(config, token, agora, transporte);
      if (dados.type !== "USER") throw new FalhaOAuth("token_invalido");
    }
    return { ok: true, accessToken: token, tokenType: dados.type,
      tokenExpiresAt: dados.expires_at === 0 ? null : new Date(dados.expires_at * 1000).toISOString(),
      dataAccessExpiresAt: dados.data_access_expires_at === 0 ? null : new Date(dados.data_access_expires_at * 1000).toISOString(),
      checkedAt: agora.toISOString() };
  } catch (erro) {
    return { ok: false, error: erro instanceof FalhaOAuth ? erro.codigo : "resposta_invalida" };
  }
}
