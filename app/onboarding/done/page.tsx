import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { lerJornada } from "@/lib/onboarding/jornada";
import { proximoPasso, resumoDoOnboarding } from "@/lib/onboarding/passos";
import { env } from "@/lib/env";
import { oQueMaisExiste } from "@/lib/onboarding/o-que-mais-existe";
import { DoneClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function DonePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/login");

  const { state } = await lerJornada(user.id, activeOrg.orgId);
  const pendente = proximoPasso(state, { lojaLigada: env.NUVEMSHOP_ENABLED });
  if (pendente) redirect(`/onboarding/${pendente.segmento}`);

  // O resumo sai da MESMA fonte que decidiu a ordem e desenhou o indicador.
  // Antes era uma terceira lista, fixa, e por isso ela listava "Loja Nuvemshop
  // (pulado)" em instalações que nunca ofereceram esse passo — o wizard
  // acusando a pessoa de não fazer o que ninguém lhe pediu.
  const itens = resumoDoOnboarding(state, { lojaLigada: env.NUVEMSHOP_ENABLED });

  return <DoneClient itens={itens} pecas={oQueMaisExiste()} />;
}
