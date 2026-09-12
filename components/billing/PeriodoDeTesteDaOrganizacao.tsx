import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fimDoPeriodoDeTeste } from "@/lib/billing/periodo-de-teste";
import { PeriodoDeTeste } from "./PeriodoDeTeste";
import { instanteDoServidor } from "@/lib/billing/relogio-servidor";

/** organizationId vem da organização ativa resolvida pelo guard da página. */
export async function PeriodoDeTesteDaOrganizacao({ organizationId }: { organizationId: string }) {
  const db = await createClient();
  const { data, error } = await db.from("organizations").select("created_at").eq("id", organizationId).maybeSingle();
  return <PeriodoDeTeste fim={error ? null : fimDoPeriodoDeTeste(data?.created_at)} agora={instanteDoServidor()} />;
}
