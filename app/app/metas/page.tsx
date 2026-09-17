import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { roleAtLeast } from "@/lib/auth/types";

import { MetasClient } from "./_components/MetasClient";

export const dynamic = "force-dynamic";

export default async function MetasPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || !roleAtLeast(activeOrg.role, "agent")) redirect("/app");

  return <MetasClient
    canManage={user.is_platform_admin || roleAtLeast(activeOrg.role, "manager")}
    orgId={activeOrg.orgId}
    userId={user.id}
    role={activeOrg.role}
  />;
}
