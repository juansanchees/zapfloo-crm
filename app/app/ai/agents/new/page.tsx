import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { listSelectableChannels } from "@/lib/channels/selectable";
import { createClient } from "@/lib/supabase/server";
import type { CredentialRow } from "@/hooks/ai/useCredentials";

import { lerAmbiente } from "@/lib/instalacao/ambiente";

import { AgentForm } from "../[id]/_components/AgentForm";
import { escolherModeloDoProvedor } from "@/lib/ai/agents/escolher-modelo";
import {
  escolherCredencialInicial,
  provedorDaConfiguracaoDaOrganizacao,
} from "@/lib/ai/agents/configuracao-inicial";
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const CREDENTIAL_COLUMNS =
  "id, organization_id, provider, label, api_key_last4, validated_at, validation_error, models_available, is_active, created_by, created_at, updated_at";

/**
 * Os provedores cuja chave veio na INSTALAÇÃO (`.env`), não da tela de
 * Credenciais.
 *
 * Sai de `lerAmbiente`, a mesma leitura que o retrato da instalação usa — uma
 * segunda lista de nomes de variável divergiria no dia em que um provedor novo
 * entrasse.
 */
function provedoresDaInstalacao(): string[] {
  const a = lerAmbiente();
  return Object.entries(a.chavesDeProvedor)
    .filter(([, tem]) => tem)
    .map(([id]) => id);
}

export default async function NewAgentPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const supabase = await createClient();
  const { data: organizacao, error: organizacaoError } = await supabase
    .from("organizations")
    .select("settings,timezone")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  const provider = provedorDaConfiguracaoDaOrganizacao(organizacao?.settings);
  const configuracaoDaOrganizacaoDisponivel = !organizacaoError && !!organizacao;
  if (organizacaoError) {
    logger.error("[ai/agents/new] não consegui ler a configuração da organização", {
      organization_id: activeOrg.orgId,
      detail: organizacaoError.message.slice(0, 200),
    });
  }

  const [credentialsRes, channelSessions, modelosRes] = await Promise.all([
    supabase
      .from("ai_provider_credentials_safe")
      .select(CREDENTIAL_COLUMNS)
      .eq("organization_id", activeOrg.orgId),
    listSelectableChannels(supabase, activeOrg.orgId),
    supabase
      .from("ai_models")
      .select("model_id,is_default_for_provider,supports_tools,input_price_per_million_cents,output_price_per_million_cents")
      .eq("provider", provider)
      .is("deprecated_at", null),
  ]);

  const credentials = (credentialsRes.data ?? []) as unknown as CredentialRow[];
  const escolha = escolherModeloDoProvedor(modelosRes.data ?? []);
  // Para criar RASCUNHO basta a credencial ativa; publicar continua bloqueado
  // até ela ser validada. Preferimos a validada, mas não devolvemos a decisão
  // técnica ao usuário só porque a instalação ainda precisa concluir o teste
  // da chave que já cadastrou.
  const provedoresInstalados = provedoresDaInstalacao();
  const credencialInicial = escolherCredencialInicial(
    credentials,
    provider,
    provedoresInstalados.includes(provider),
  );
  const timezone =
    typeof organizacao?.timezone === "string" && fusoValido(organizacao.timezone)
      ? organizacao.timezone
      : FUSO_PADRAO;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <AgentForm
        mode="create"
        credentials={credentials}
        provedoresDaInstalacao={provedoresInstalados}
        channelSessions={channelSessions}
        initialSetup={{
          provider,
          model:
            configuracaoDaOrganizacaoDisponivel && escolha.escolhido
              ? escolha.modelId
              : "",
          credential_id: configuracaoDaOrganizacaoDisponivel
            ? credencialInicial ?? ""
            : "",
          // A pessoa vê a prévia do preset antes de ligar capacidades. Um
          // agente criado fora do onboarding não herda permissões em silêncio.
          tool_ids: [],
          organization_timezone: timezone,
        }}
      />
    </div>
  );
}
