import { randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { fail, ok } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";
import { recuperarLeiturasDoSite } from "@/lib/onboarding/site/servico";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Recupera o after interrompido: no máximo duas leituras de 30s, em paralelo.
 * Mesma autenticação dos crons da VPS; sem segredo, nenhum banco é consultado. */
export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = req.headers.get("authorization") ?? "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const provided = Buffer.from(supplied);
  const authorized = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].some((secret) => {
    if (!secret || !provided.length) return false;
    const expected = Buffer.from(secret);
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  });
  if (!authorized) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  try {
    return ok(await recuperarLeiturasDoSite(), { requestId });
  } catch {
    logger.error("onboarding.site_cron_failed", { requestId });
    return fail("internal_error", "Site reading queue unavailable.", 503, { requestId });
  }
}

export const POST = GET;
