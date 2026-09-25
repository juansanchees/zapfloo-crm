import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { validarChaveUnicaMonetizze } from "@/lib/billing/monetizze/auth";
import { parseMonetizzePayload } from "@/lib/billing/monetizze/parser";
import { processarPostbackMonetizze } from "@/lib/billing/monetizze/processar";
import { fail, ok } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 1_000_000;
const RATE_LIMIT_PER_MIN = 60;

function opaco(valor: string): string {
  return createHash("sha256").update(valor, "utf8").digest("hex").slice(0, 32);
}

function ipDoRequest(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")?.trim()
    || "sem-ip";
}

async function limitado(bucket: string): Promise<boolean> {
  const resultado = await checkRateLimit(bucket, RATE_LIMIT_PER_MIN, 60);
  return !resultado.allowed;
}

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  if (!env.MONETIZZE_CHAVE_UNICA) {
    return fail("service_unavailable", "monetizze_not_configured", 503, { requestId });
  }

  if (await limitado(`monetizze:ip:${opaco(ipDoRequest(req))}`)) {
    return fail("rate_limited", "Too many requests.", 429, {
      requestId,
      headers: { "Retry-After": "60" },
    });
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return fail("invalid_request", "payload_too_large", 413, { requestId });
  }
  const parsed = parseMonetizzePayload(raw, req.headers.get("content-type") ?? "");
  if (!parsed.ok) {
    return fail("invalid_request", parsed.code, 400, { requestId });
  }
  if (!validarChaveUnicaMonetizze(parsed.value.accountKey, env.MONETIZZE_CHAVE_UNICA)) {
    return fail("unauthenticated", "invalid_monetizze_key", 401, { requestId });
  }
  if (await limitado(`monetizze:account:${opaco(parsed.value.accountKey)}`)) {
    return fail("rate_limited", "Too many requests.", 429, {
      requestId,
      headers: { "Retry-After": "60" },
    });
  }

  try {
    const result = await processarPostbackMonetizze(parsed.value, {
      secret: env.MONETIZZE_CHAVE_UNICA,
      planReferences: {
        basico: env.MONETIZZE_PLANO_REFERENCIA_BASICO,
        essencial: env.MONETIZZE_PLANO_REFERENCIA_ESSENCIAL,
        completo: env.MONETIZZE_PLANO_REFERENCIA_COMPLETO,
      },
    });
    return ok({ status: result.status }, { requestId });
  } catch (error) {
    logger.error("[billing.monetizze] falha ao processar postback", {
      requestId,
      error: error instanceof Error ? error.message : "erro_desconhecido",
    });
    return fail("service_unavailable", "billing_event_temporarily_unavailable", 503, { requestId });
  }
}
