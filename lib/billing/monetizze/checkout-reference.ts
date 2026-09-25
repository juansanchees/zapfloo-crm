import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const CHECKOUT_REFERENCE_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_CONTEXT = "zapfloo:monetizze:checkout-reference:v1";
const MAX_TOKEN_LENGTH = 4096;
const MIN_SECRET_LENGTH = 16;

const payloadSchema = z.object({
  v: z.literal(1),
  organization_id: z.string().uuid(),
  issued_at: z.string().datetime({ offset: true }),
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
}).strict();

export interface CheckoutReference {
  organizationId: string;
  issuedAt: string;
  nonce: string;
}

interface CreateOptions {
  secret: string;
  now?: Date;
  nonce?: string;
}

interface VerifyOptions {
  secret: string;
  now?: Date;
  /** Somente para provar separação criptográfica em teste. */
  context?: string;
}

function validSecret(secret: string): string | null {
  const normalized = secret?.trim() ?? "";
  return normalized.length >= MIN_SECRET_LENGTH ? normalized : null;
}

function deriveKey(secret: string, context: string): Buffer {
  return createHmac("sha256", secret).update(`derive\0${context}`, "utf8").digest();
}

function sign(encodedPayload: string, secret: string, context: string): Buffer {
  return createHmac("sha256", deriveKey(secret, context))
    .update(`${context}\0${encodedPayload}`, "utf8")
    .digest();
}

export function createCheckoutReference(
  organizationId: string,
  options: CreateOptions,
): string {
  const secret = validSecret(options.secret);
  if (!secret) throw new Error("Segredo da Monetizze ausente ou curto demais");

  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Relógio inválido para referência de checkout");

  const parsed = payloadSchema.safeParse({
    v: 1,
    organization_id: organizationId,
    issued_at: now.toISOString(),
    nonce: options.nonce ?? randomBytes(16).toString("hex"),
  });
  if (!parsed.success) throw new Error("Organização, instante ou nonce inválido para referência de checkout");

  const encoded = Buffer.from(JSON.stringify(parsed.data), "utf8").toString("base64url");
  const signature = sign(encoded, secret, DEFAULT_CONTEXT).toString("base64url");
  return `${encoded}.${signature}`;
}

export function verifyCheckoutReference(
  token: string | null | undefined,
  options: VerifyOptions,
): CheckoutReference | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const secret = validSecret(options.secret);
  if (!secret) return null;
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) return null;

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encoded, receivedText] = parts;
  const context = options.context ?? DEFAULT_CONTEXT;
  const expected = sign(encoded, secret, context);

  let received: Buffer;
  try {
    received = Buffer.from(receivedText, "base64url");
  } catch {
    return null;
  }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return null;

  const issuedAtMs = Date.parse(parsed.data.issued_at);
  const age = now.getTime() - issuedAtMs;
  if (!Number.isFinite(issuedAtMs) || age < 0 || age >= CHECKOUT_REFERENCE_TTL_MS) return null;

  return {
    organizationId: parsed.data.organization_id,
    issuedAt: parsed.data.issued_at,
    nonce: parsed.data.nonce,
  };
}
