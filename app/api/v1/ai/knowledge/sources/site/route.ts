import { randomUUID } from "node:crypto";
import { after, type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import {
  enfileirarSiteDoAcervo,
  processarFonteDoSite,
} from "@/lib/onboarding/site/servico";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const inputSchema = z.object({ url: z.string().trim().min(1).max(2_000) }).strict();

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_knowledge" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Informe um endereço de site válido."), 422, { requestId });

  let sourceId: string | null;
  try {
    sourceId = await enfileirarSiteDoAcervo(authz.org.orgId, parsed.data.url);
  } catch {
    return fail("internal_error", t("Não consegui colocar o site na fila de leitura."), 503, { requestId });
  }
  if (!sourceId) {
    return fail("validation_failed", t("Este endereço não pode ser lido com segurança."), 422, { requestId });
  }

  await audit({
    action: "knowledge_source.updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "ai_knowledge_source",
    resourceId: sourceId,
    metadata: { operation: "site_read_queued" },
  });
  after(() => processarFonteDoSite(authz.org.orgId, sourceId));
  return ok({ id: sourceId, queued: true }, { requestId, status: 201 });
}
