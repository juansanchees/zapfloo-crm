import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  aiAccessUpdateSchema, lerModoDeAcessoDaIa, lerNumerosDeTeste,
} from "@/lib/ai/elegibilidade/pre-go-live";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

/** Só o acesso observado pela UI; alterações de transporte não invalidam a tela. */
function accessRevision(metadata: unknown): string {
  const m = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  return createHash("sha256").update(JSON.stringify([m.ai_gate ?? null, m.ai_gate_mode ?? null, m.ai_test_phone_numbers ?? null])).digest("hex");
}

/** Só administradores podem ler os telefones de teste ou mudar o alcance da IA. */
export async function GET(_req: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "channel_sessions", allowPlatformAdmin: true });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail("validation_failed", "Canal inválido.", 422, { requestId });
  const { data, error } = await createAdminClient().from("channel_sessions")
    .select("metadata").eq("organization_id", auth.org.orgId).eq("id", id)
    .is("archived_at", null).maybeSingle();
  if (error) return fail("internal_error", "Não foi possível carregar o acesso da IA.", 500, { requestId });
  if (!data) return fail("not_found", "Canal não encontrado.", 404, { requestId });
  return ok({ mode: lerModoDeAcessoDaIa(data.metadata), test_phone_numbers: lerNumerosDeTeste(data.metadata), access_revision: accessRevision(data.metadata) }, { requestId });
}

export async function PATCH(req: NextRequest, { params }: Context): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "channel_sessions", allowPlatformAdmin: true });
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return fail("validation_failed", "Canal inválido.", 422, { requestId });
  const parsed = aiAccessUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Use telefones com DDI, por exemplo +5511999998888.", 422, { requestId });
  const { mode, test_phone_numbers } = parsed.data;
  const admin = createAdminClient();
  let revision: string | undefined;
  if (parsed.data.restricted_only) {
    const conflict = () => fail("state_conflict", "O acesso da IA mudou. Reabra o painel e confira antes de salvar.", 409, { requestId });
    const read = await admin.from("channel_sessions").select("metadata")
      .eq("organization_id", auth.org.orgId).eq("id", id).is("archived_at", null).maybeSingle();
    if (read.error) return fail("internal_error", "Não foi possível carregar o acesso da IA.", 500, { requestId });
    if (!read.data) return fail("not_found", "Canal não encontrado.", 404, { requestId });
    const current = read.data.metadata;
    if (!current || typeof current !== "object" || Array.isArray(current)
      || lerModoDeAcessoDaIa(current) !== "pre_go_live"
      || accessRevision(current) !== parsed.data.expected_access_revision) return conflict();
    // Mesmo efeito da RPC 0218 nas três chaves, preservando transporte. O CAS
    // inteiro impede sobrescrever qualquer alteração entre esta leitura e UPDATE.
    const next = { ...current, ai_gate: "allowlist", ai_gate_mode: "pre_go_live", ai_test_phone_numbers: test_phone_numbers };
    const write = await admin.from("channel_sessions").update({ metadata: next })
      .eq("organization_id", auth.org.orgId).eq("id", id).is("archived_at", null)
      .eq("metadata", JSON.stringify(current)).select("id").maybeSingle();
    if (write.error) return fail("internal_error", "Não foi possível salvar o acesso da IA.", 500, { requestId });
    if (!write.data) return conflict();
    revision = accessRevision(next);
  } else {
  // RPC atômica: não sobrescreve as demais configurações de metadata.
  const { data, error } = await admin.rpc("fn_configurar_pre_go_live_canal", {
    p_org: auth.org.orgId, p_canal: id, p_modo: mode, p_numeros: test_phone_numbers,
  });
  if (error) return fail("internal_error", "Não foi possível salvar o acesso da IA. Verifique se o banco está atualizado.", 500, { requestId });
  if (data !== 1) return fail("not_found", "Canal não encontrado.", 404, { requestId });
  }
  void audit({
    action: "channel.ai_access_updated", actorUserId: auth.user.id,
    organizationId: auth.org.orgId, resourceType: "channel_session", resourceId: id, requestId,
    metadata: { mode, test_phone_numbers_count: test_phone_numbers.length },
  });
  return ok({ mode, test_phone_numbers, ...(revision ? { access_revision: revision } : {}) }, { requestId });
}
