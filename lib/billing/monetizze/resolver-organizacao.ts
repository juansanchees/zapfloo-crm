import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCheckoutReference } from "./checkout-reference";

const emailSchema = z.string().trim().toLowerCase().email().max(320);
const USERS_PER_PAGE = 1000;
const MAX_AUTH_PAGES = 50;

export interface NormalizedOrganizationResolutionInput {
  sourceReference?: string | null;
  buyerEmail?: string | null;
}

export interface OrganizationResolutionDependencies {
  organizationExists(organizationId: string): Promise<boolean>;
  findAcceptedAdminOrganizationIdsByEmail(email: string): Promise<string[]>;
}

export type OrganizationResolution =
  | {
      kind: "resolved";
      via: "signed_src" | "admin_email";
      organizationId: string;
      buyerEmailHash: string | null;
      buyerEmailMasked: string | null;
    }
  | {
      kind: "pending";
      reason: "missing_identity" | "invalid_email" | "no_admin_match" | "ambiguous_admin_email";
      buyerEmailHash: string | null;
      buyerEmailMasked: string | null;
    };

function normalizeBuyerEmail(email: string): string | null {
  const parsed = emailSchema.safeParse(email);
  return parsed.success ? parsed.data : null;
}

export function sha256BuyerEmail(email: string): string {
  const normalized = normalizeBuyerEmail(email);
  if (!normalized) throw new Error("E-mail do comprador inválido");
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function maskBuyerEmail(email: string): string {
  const normalized = normalizeBuyerEmail(email);
  if (!normalized) throw new Error("E-mail do comprador inválido");
  const at = normalized.lastIndexOf("@");
  return `${normalized[0]}***${normalized.slice(at)}`;
}

export function createOrganizationResolutionDependencies(
  admin: SupabaseClient = createAdminClient(),
): OrganizationResolutionDependencies {
  return {
    async organizationExists(organizationId) {
      const { data, error } = await admin
        .from("organizations")
        .select("id")
        .eq("id", organizationId)
        .maybeSingle();
      if (error) throw new Error(`Falha ao validar organização: ${error.message}`);
      return data?.id === organizationId;
    },

    async findAcceptedAdminOrganizationIdsByEmail(email) {
      const normalized = normalizeBuyerEmail(email);
      if (!normalized) return [];

      let matchingUserId: string | null = null;
      for (let page = 1; page <= MAX_AUTH_PAGES; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
        if (error) throw new Error(`Falha ao consultar diretório de usuários: ${error.message}`);
        const users = data.users ?? [];
        const matches = users.filter((user) => user.email?.trim().toLowerCase() === normalized);
        if (matches.length > 1 || (matchingUserId && matches.length > 0)) return [];
        if (matches[0]) matchingUserId = matches[0].id;
        if (users.length < USERS_PER_PAGE) break;
      }
      if (!matchingUserId) return [];

      const { data, error } = await admin
        .from("user_organizations")
        .select("organization_id, organizations!inner(id)")
        .eq("user_id", matchingUserId)
        .eq("role", "admin")
        .not("accepted_at", "is", null)
        .is("revoked_at", null);
      if (error) throw new Error(`Falha ao consultar vínculos administrativos: ${error.message}`);
      return [...new Set((data ?? []).map((row) => row.organization_id))];
    },
  };
}

export async function resolveMonetizzeOrganization(
  input: NormalizedOrganizationResolutionInput,
  options: {
    secret: string;
    now?: Date;
    dependencies?: OrganizationResolutionDependencies;
  },
): Promise<OrganizationResolution> {
  const dependencies = options.dependencies ?? createOrganizationResolutionDependencies();
  const normalizedEmail = input.buyerEmail ? normalizeBuyerEmail(input.buyerEmail) : null;
  const emailDetails = normalizedEmail
    ? {
        buyerEmailHash: sha256BuyerEmail(normalizedEmail),
        buyerEmailMasked: maskBuyerEmail(normalizedEmail),
      }
    : { buyerEmailHash: null, buyerEmailMasked: null };

  const reference = verifyCheckoutReference(input.sourceReference, {
    secret: options.secret,
    now: options.now,
  });
  if (reference && await dependencies.organizationExists(reference.organizationId)) {
    return {
      kind: "resolved",
      via: "signed_src",
      organizationId: reference.organizationId,
      ...emailDetails,
    };
  }

  if (input.buyerEmail && !normalizedEmail) {
    return { kind: "pending", reason: "invalid_email", ...emailDetails };
  }
  if (!normalizedEmail) {
    return { kind: "pending", reason: "missing_identity", ...emailDetails };
  }

  const organizationIds = await dependencies.findAcceptedAdminOrganizationIdsByEmail(normalizedEmail);
  if (organizationIds.length === 1) {
    return {
      kind: "resolved",
      via: "admin_email",
      organizationId: organizationIds[0]!,
      ...emailDetails,
    };
  }
  return {
    kind: "pending",
    reason: organizationIds.length === 0 ? "no_admin_match" : "ambiguous_admin_email",
    ...emailDetails,
  };
}
