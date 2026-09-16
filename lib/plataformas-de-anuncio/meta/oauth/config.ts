/** Configuração opcional da instalação, nunca proveniente da requisição. */
import { z } from "zod";
import { env } from "@/lib/env";

export const CAMINHO_CALLBACK_META_ADS = "/api/v1/ads/meta/oauth/callback";
export const VERSAO_GRAPH_PADRAO = "v22.0";

export interface ConfigOAuth {
  appId: string;
  appSecret: string;
  configId: string;
  redirectUri: string;
  graphVersion: string;
}

const configuracao = z.object({
  appId: z.string().regex(/^\d+$/),
  appSecret: z.string().min(1),
  configId: z.string().regex(/^\d+$/),
  graphVersion: z.string().regex(/^v\d+\.\d+$/),
});

/** Sem configuração completa, a tela continua utilizável pelo caminho manual. */
export function configuracaoOAuth(): ConfigOAuth | null {
  const resultado = configuracao.safeParse({
    appId: process.env.META_APP_ID?.trim(),
    appSecret: process.env.META_APP_SECRET?.trim(),
    configId: process.env.META_LOGIN_CONFIG_ID?.trim(),
    graphVersion: process.env.META_GRAPH_VERSION?.trim() || VERSAO_GRAPH_PADRAO,
  });
  if (!resultado.success) return null;

  try {
    // O objeto validado lê o env em runtime. Acesso direto a NEXT_PUBLIC_ aqui
    // seria substituído pelo build e quebraria a imagem pré-compilada da VPS.
    const base = new URL(env.NEXT_PUBLIC_APP_URL);
    const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
    if (base.username || base.password || base.search || base.hash || base.pathname !== "/") return null;
    if (base.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && localhost && base.protocol === "http:")) return null;
    return { ...resultado.data, redirectUri: new URL(CAMINHO_CALLBACK_META_ADS, base.origin).href };
  } catch {
    return null;
  }
}

/** config_id escolhe os escopos: não sobrepor com permissões extras na URL. */
export function montarUrlConsentimento(config: ConfigOAuth, state: string): string {
  const url = new URL(`https://www.facebook.com/${config.graphVersion}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: config.appId,
    config_id: config.configId,
    redirect_uri: config.redirectUri,
    state,
    response_type: "code",
    override_default_response_type: "true",
  }).toString();
  return url.href;
}
