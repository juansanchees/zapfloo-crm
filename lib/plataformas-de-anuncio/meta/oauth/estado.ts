/**
 * Mesmo mecanismo dos OAuth existentes: HMAC + prazo + comparação constante.
 * Link público e state NÃO são intercambiáveis. O link não revela org/user.
 * Consumo único é do banco; requestId é a identidade que a rota deve consumir.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const VALIDADE_LINK_MS = 30 * 60 * 1000;
export const VALIDADE_ESTADO_MS = 10 * 60 * 1000;
const LIMITE_TOKEN = 2048;
const instante = z.number().int().nonnegative().max(8_640_000_000_000_000);
const linkSchema = z.object({ requestId: z.uuid(), expiresAt: instante }).strict();
const estadoSchema = linkSchema.extend({ organizationId: z.uuid(), userId: z.uuid() }).strict();
export type LinkOAuth = z.infer<typeof linkSchema>;
export type EstadoOAuth = z.infer<typeof estadoSchema>;
type Finalidade = "link" | "sessao";

function chave(): string | null {
  const valor = process.env.INTERNAL_SECRET?.trim();
  return valor && valor.length >= 32 ? valor : null;
}

function mac(carga: string, finalidade: Finalidade, segredo: string): Buffer {
  return createHmac("sha256", segredo).update(`meta-ads/oauth/v1/${finalidade}\0${carga}`, "utf8").digest();
}

function emitir(dados: LinkOAuth | EstadoOAuth, finalidade: Finalidade, agora: Date): string | null {
  const segredo = chave();
  const esquema = finalidade === "link" ? linkSchema : estadoSchema;
  const parsed = esquema.safeParse(dados);
  const issuedAt = agora.getTime();
  const ttl = finalidade === "link" ? VALIDADE_LINK_MS : VALIDADE_ESTADO_MS;
  if (!segredo || !parsed.success || !Number.isSafeInteger(issuedAt)) return null;
  if (parsed.data.expiresAt <= issuedAt || parsed.data.expiresAt - issuedAt > ttl) return null;
  const carga = Buffer.from(JSON.stringify({ v: 1, issuedAt, dados: parsed.data })).toString("base64url");
  return `${carga}.${mac(carga, finalidade, segredo).toString("hex")}`;
}

function verificar(token: string | null | undefined, finalidade: Finalidade, agora: Date): unknown | null {
  const segredo = chave();
  if (!segredo || typeof token !== "string" || token.length > LIMITE_TOKEN) return null;
  const partes = /^([A-Za-z0-9_-]+)\.([0-9a-f]{64})$/.exec(token);
  if (!partes?.[1] || !partes[2]) return null;
  const carga = partes[1];
  const recebido = Buffer.from(partes[2], "hex");
  const esperado = mac(carga, finalidade, segredo);
  if (!timingSafeEqual(recebido, esperado)) return null;
  try {
    const bytes = Buffer.from(carga, "base64url");
    if (bytes.toString("base64url") !== carga) return null;
    const esquema = z.object({
      v: z.literal(1), issuedAt: instante,
      dados: finalidade === "link" ? linkSchema : estadoSchema,
    }).strict();
    const resultado = esquema.safeParse(JSON.parse(bytes.toString("utf8")));
    if (!resultado.success) return null;
    const { issuedAt, dados } = resultado.data;
    const now = agora.getTime();
    const ttl = finalidade === "link" ? VALIDADE_LINK_MS : VALIDADE_ESTADO_MS;
    if (!Number.isSafeInteger(now) || issuedAt > now || dados.expiresAt <= now) return null;
    if (dados.expiresAt <= issuedAt || dados.expiresAt - issuedAt > ttl) return null;
    return dados;
  } catch {
    return null;
  }
}

export function assinarLink(dados: LinkOAuth, agora = new Date()): string | null {
  return emitir(dados, "link", agora);
}
export function verificarLink(token: string | null | undefined, agora = new Date()): LinkOAuth | null {
  const resultado = linkSchema.safeParse(verificar(token, "link", agora));
  return resultado.success ? resultado.data : null;
}
export function assinarEstado(dados: EstadoOAuth, agora = new Date()): string | null {
  return emitir(dados, "sessao", agora);
}
export function verificarEstado(token: string | null | undefined, agora = new Date()): EstadoOAuth | null {
  const resultado = estadoSchema.safeParse(verificar(token, "sessao", agora));
  return resultado.success ? resultado.data : null;
}

/** A rota guarda apenas o hash; o valor bruto fica no cookie HttpOnly. */
export function gerarVinculoNavegador(): string {
  return randomBytes(32).toString("base64url");
}
export function hashVinculoNavegador(valor: string | null | undefined): string | null {
  if (typeof valor !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(valor)) return null;
  if (Buffer.from(valor, "base64url").toString("base64url") !== valor) return null;
  return createHash("sha256").update(valor).digest("hex");
}
export function conferirVinculoNavegador(valor: string | null | undefined, hash: string | null | undefined): boolean {
  const calculado = hashVinculoNavegador(valor);
  if (!calculado || typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(calculado, "hex"), Buffer.from(hash, "hex"));
}
