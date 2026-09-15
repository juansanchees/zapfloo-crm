/**
 * Configurações → Meta Ads. Onde o token de LEITURA da conta de anúncios é
 * conectado.
 *
 * ─── Por que uma tela separada de Configurações › Conversões ────────────────
 *
 * As duas conectam "a Meta", e juntá-las é tentador. São credenciais
 * diferentes, com escopos diferentes na plataforma (uma escreve conversões, a
 * outra lê `ads_read`), guardadas em tabelas diferentes pelas razões no
 * cabeçalho da migration 0214 — e com consequências diferentes quando falham:
 * um token de leitura vencido deixa uma tela vazia; o de conversões vencido faz
 * a empresa parar de reportar vendas sem ninguém perceber.
 *
 * Uma tela só, com dois campos de token que se parecem, é como alguém cola o
 * token errado no campo errado e passa uma semana achando que a integração
 * quebrou.
 *
 * ─── Por que ADMIN CLIENT para ler ──────────────────────────────────────────
 *
 * `ad_insights_connections` tem RLS ligada com ZERO policies e grants revogados
 * de anon/authenticated (0214). Pelo client de sessão esta página mostraria
 * "não conectado" para todo mundo — o gate de papel abaixo é o que autoriza, e a
 * leitura privilegiada acontece no servidor.
 *
 * O token NÃO é lido aqui, nem decifrado: `existeConexaoDeLeitura` responde
 * apenas se a linha existe. A tela nunca mostra o token de volta.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { existeConexaoDeLeitura } from "@/lib/plataformas-de-anuncio/credenciais-de-leitura";
import { configuracaoOAuth } from "@/lib/plataformas-de-anuncio/meta/oauth/config";
import { createAdminClient } from "@/lib/supabase/admin";

import { FormularioDeMetaAds } from "./_form";
import { ConexaoOAuthMetaAds } from "./_oauth";

export const metadata = { title: "Meta Ads" };
export const dynamic = "force-dynamic";

export default async function MetaAdsSettingsPage({ searchParams }: {
  searchParams?: Promise<{ oauth?: string }>;
} = {}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  // A autorização delegada e a escolha de conta têm o mesmo piso da leitura.
  // A escrita manual do segredo e a desconexão continuam exclusivas de admin.
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const admin = createAdminClient();
  const conexao = await existeConexaoDeLeitura(admin, activeOrg.orgId, "meta_ads");
  const oauthHabilitado = Boolean(configuracaoOAuth());
  const podeEditarManualmente = user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;
  const retorno = (await searchParams)?.oauth;
  const resultado = retorno === "conectado" || retorno === "erro" || retorno === "cancelado" ? retorno : undefined;

  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Meta Ads")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {oauthHabilitado ? t("Conecte sua conta de anúncios com o Facebook ou gere um link para quem cuida dos anúncios autorizar. Esta conexão permite apenas ler o desempenho das campanhas.") : t(
            "Conecte um token de acesso para o sistema ler o desempenho das suas campanhas e mostrá-lo em Análise › Meta Ads. É uma conexão só de leitura: nada é criado, pausado ou alterado na sua conta de anúncios.",
          )}
        </p>
      </header>

      <ConexaoOAuthMetaAds
        key={activeOrg.orgId}
        habilitada={oauthHabilitado}
        conectada={conexao.conectada}
        contaPadrao={conexao.contaPadrao}
        idioma={idioma}
        resultado={resultado}
      />

      {!oauthHabilitado && !podeEditarManualmente && (
        <p className="text-sm text-muted-foreground">{t("A conexão automática não está disponível nesta instalação. Peça a quem administra a organização para configurar a conexão manual.")}</p>
      )}

      {podeEditarManualmente && (oauthHabilitado ? (
        <details className="rounded-md border p-4">
          <summary className="cursor-pointer font-medium">{t("Avançado")}</summary>
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t("O token precisa da permissão ads_read. Gere-o no Meta for Developers, na sua conta de aplicativo, e cole abaixo — ele fica guardado criptografado e nunca é mostrado de volta.")}</p>
            <FormularioDeMetaAds conectada={conexao.conectada} contaPadrao={conexao.contaPadrao} idioma={idioma} />
          </div>
        </details>
      ) : (
        <>
          <div className="rounded-md border border-sky-500/40 bg-sky-500/10 p-4 text-sm">
            {t("O token precisa da permissão ads_read. Gere-o no Meta for Developers, na sua conta de aplicativo, e cole abaixo — ele fica guardado criptografado e nunca é mostrado de volta.")}
          </div>
          <FormularioDeMetaAds conectada={conexao.conectada} contaPadrao={conexao.contaPadrao} idioma={idioma} />
        </>
      ))}

      {podeEditarManualmente && conexao.conectada && !oauthHabilitado && (
        <p className="text-sm text-muted-foreground">
          {t("Para trocar apenas a conta padrão, deixe o campo do token em branco — o token guardado é mantido.")}
        </p>
      )}
    </div>
  );
}
