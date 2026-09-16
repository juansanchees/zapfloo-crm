import { randomUUID } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { processarFonteDoSite, reenfileirarSite } from "@/lib/onboarding/site/servico";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const inputSchema = z.object({ source_id: z.string().uuid() }).strict();

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_knowledge" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });
  try {
    if (!await reenfileirarSite(authz.org.orgId, parsed.data.source_id)) {
      return fail("conflict", t("Não consegui reiniciar esta leitura. Confira o estado do material."), 409, { requestId });
    }
  } catch {
    return fail("internal_error", t("Não consegui reiniciar esta leitura. Tente novamente."), 503, { requestId });
  }
  await audit({
    action: "knowledge_source.updated", actorUserId: authz.user.id,
    organizationId: authz.org.orgId, resourceType: "ai_knowledge_source",
    resourceId: parsed.data.source_id, metadata: { operation: "site_read_retry" },
  });
  after(() => processarFonteDoSite(authz.org.orgId, parsed.data.source_id));
  return ok({ queued: true }, { requestId });
}
