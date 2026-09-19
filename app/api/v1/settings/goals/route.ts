/** Metas operacionais guardadas em `organizations.settings.operational_goals`. */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import {
  operationalGoalsForStorage,
  operationalGoalsFromStored,
  operationalGoalsSchema,
  parseOperationalGoalMembers,
  storedOperationalGoalsFromSettings,
} from "@/lib/metas/config";
import {
  decryptOperationalGoalMembers,
  encryptOperationalGoalMembers,
} from "@/lib/metas/members-cipher";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", {
    requestId,
    resource: "operational_goals",
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const stored = storedOperationalGoalsFromSettings(data?.settings);
  const members = await readMembers(stored.members_enc);
  if (members === null) return fail("internal_error", "Não foi possível ler as metas individuais.", 500, { requestId });
  const goals = operationalGoalsFromStored(stored, members);

  // A cifra é a proteção contra leitura direta do jsonb por PostgREST. Mesmo
  // aqui, quem é agent só recebe sua própria chave; manager/admin recebe a
  // configuração completa porque é quem a administra.
  return ok(
    {
      ...goals,
      members: authz.org.role === "manager" || authz.org.role === "admin" || authz.user.is_platform_admin
        ? goals.members
        : goals.members[authz.user.id] ? { [authz.user.id]: goals.members[authz.user.id] } : {},
    },
    { requestId },
  );
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", {
    requestId,
    resource: "operational_goals",
    allowPlatformAdmin: true,
  });
  if (!authz.ok) return authz.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("validation_failed", "Dados inválidos.", 422, { requestId });
  }
  const parsed = operationalGoalsSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const admin = createAdminClient();
  const membersEnc = Object.keys(parsed.data.members).length > 0
    ? encryptOperationalGoalMembers(JSON.stringify(parsed.data.members))
    : undefined;
  if (Object.keys(parsed.data.members).length > 0 && !membersEnc) {
    return fail("encryption_unavailable", "Não foi possível guardar as metas individuais com segurança.", 422, { requestId });
  }

  // Não existe RPC genérica de settings neste recorte. O CAS compara o jsonb
  // que foi lido e tenta de novo sobre a versão nova: assim nunca reaplica o
  // snapshot antigo por cima de routing/branding/segurança de outra aba.
  let saved = false;
  for (let attempt = 0; attempt < 3 && !saved; attempt += 1) {
    const { data: current, error: readError } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", authz.org.orgId)
      .maybeSingle();
    if (readError) return fail("internal_error", readError.message, 500, { requestId });
    if (!current) return fail("tenant_not_found", "Organização não encontrada.", 404, { requestId });

    const currentSettings = (current.settings as Record<string, unknown> | null) ?? {};
    const nextSettings = {
      ...currentSettings,
      operational_goals: operationalGoalsForStorage(parsed.data, membersEnc ?? undefined),
    };
    const { data: updated, error: updateError } = await admin
      .from("organizations")
      .update({ settings: nextSettings })
      .eq("id", authz.org.orgId)
      .eq("settings", JSON.stringify(currentSettings))
      .select("id");
    if (updateError) return fail("internal_error", updateError.message, 500, { requestId });
    saved = (updated ?? []).length === 1;
  }
  if (!saved) return fail("conflict", "A configuração mudou enquanto era salva. Tente novamente.", 409, { requestId });

  // Metadata registra a forma da mudança, sem expor valores ou metas individuais.
  void audit({
    action: "goals.config_changed",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: {
      has_team_revenue_target: parsed.data.team.monthly_revenue_cents !== undefined,
      has_team_conversations_target: parsed.data.team.monthly_conversations !== undefined,
      members_with_targets: Object.keys(parsed.data.members).length,
    },
  });

  return ok(parsed.data, { requestId });
}

async function readMembers(ciphertext: string | undefined) {
  if (!ciphertext) return {};
  const plaintext = decryptOperationalGoalMembers(ciphertext);
  if (!plaintext) return null;
  return parseOperationalGoalMembers(plaintext);
}
