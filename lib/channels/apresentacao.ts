import {
  CHANNEL_PROVIDER_META,
  CHANNEL_PROVIDER_WAHA,
  CHANNEL_PROVIDER_ZERNIO,
} from "./capabilities";
import type { ChannelProvider } from "./types";

export function rotuloDoTipoDeConexao(provider: ChannelProvider | undefined): string {
  if (provider === CHANNEL_PROVIDER_META) return "API Oficial";
  if (provider === CHANNEL_PROVIDER_ZERNIO) return "Provedor parceiro";
  if (provider === CHANNEL_PROVIDER_WAHA || provider === undefined) return "Conexão por QR";
  return "Tipo não reconhecido";
}
