import { ehProvedorSuportado } from "@/lib/ai/pontos/provedores";
import type { Provider } from "@/hooks/ai/useCredentials";

/** Token de tela; vira `credential_id: null` antes de chegar ao servidor. */
export const CHAVE_DA_INSTALACAO = "__instalacao__";

interface CredencialInicial {
  id: string;
  provider: string;
  is_active: boolean;
  validated_at: string | null;
  validation_error?: string | null;
}

/**
 * Rascunho aceita chave ativa ainda não validada; publicação não. Escolher a
 * melhor aqui evita reabrir uma decisão técnica só porque o teste da chave
 * cadastrada ainda não terminou.
 */
export function escolherCredencialInicial(
  credenciais: ReadonlyArray<CredencialInicial>,
  provider: Provider,
  instalacaoTemChave: boolean,
): string | undefined {
  const compativeis = credenciais.filter(
    (item) => item.provider === provider && item.is_active,
  );
  const validada = compativeis.find((item) => item.validated_at);
  if (validada) return validada.id;
  if (instalacaoTemChave) return CHAVE_DA_INSTALACAO;

  // Ainda em validação é melhor que uma chave já recusada. Se for a única
  // opção, a inválida permanece selecionada para o alerta explicar a saída.
  return (
    compativeis.find((item) => !item.validation_error)?.id ??
    compativeis[0]?.id
  );
}

/**
 * Provedor configurado para a organização, com degradação segura para o padrão
 * histórico quando o JSON livre contém um valor que esta versão não executa.
 */
export function provedorDaConfiguracaoDaOrganizacao(settings: unknown): Provider {
  const llm = (settings as { llm?: unknown } | null)?.llm;
  const provider = (llm as { provider?: unknown } | null | undefined)?.provider;
  if (typeof provider === "string" && ehProvedorSuportado(provider)) {
    return provider as Provider;
  }
  return "anthropic";
}
