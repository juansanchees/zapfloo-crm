import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ORIGEM_SITE } from "@/lib/catalogo/tipos";
import { traduzir } from "@/lib/i18n/dicionario";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Confirma apenas o lote que a tela mostrou. Um produto encontrado enquanto a
// pessoa conferia a lista precisa continuar esperando sua própria conferência.
const confirmarSchema = z.object({
  product_ids: z.array(z.string().uuid()).min(1).max(500),
}).strict();

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "catalog_products" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const parsed = confirmarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_products")
    .update({ ativo: true })
    .eq("organization_id", authz.org.orgId)
    .eq("origem", ORIGEM_SITE)
    .eq("ativo", false)
    .in("id", [...new Set(parsed.data.product_ids)])
    .select("id");

  if (error) {
    return fail("internal_error", t("Não consegui confirmar os produtos. Tente novamente."), 500, { requestId });
  }
  const confirmados = data?.length ?? 0;
  if (confirmados > 0) {
    await audit({
      organizationId: authz.org.orgId,
      actorUserId: authz.user.id,
      action: "catalog_product.updated",
      resourceType: "catalog_products",
      requestId,
      metadata: { origem: ORIGEM_SITE, operacao: "confirmar_rascunhos", confirmados },
    });
  }
  return ok({ confirmados }, { requestId });
}
