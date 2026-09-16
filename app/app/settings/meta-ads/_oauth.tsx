"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/clipboard";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";
import type { ContaDeAnuncio } from "@/lib/plataformas-de-anuncio/types";

type LinkDeConexao = { url: string; expires_at: string };

export function ConexaoOAuthMetaAds({
  habilitada,
  conectada,
  contaPadrao,
  idioma,
  resultado,
}: {
  habilitada: boolean;
  conectada: boolean;
  contaPadrao: string | null;
  idioma: Idioma;
  resultado?: "conectado" | "erro" | "cancelado";
}) {
  const t = useCallback((texto: string) => traduzir(texto, idioma), [idioma]);
  const router = useRouter();
  const [link, setLink] = useState<LinkDeConexao | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [contas, setContas] = useState<ContaDeAnuncio[]>([]);
  const [conta, setConta] = useState(contaPadrao ?? "");
  const [carregando, setCarregando] = useState(conectada);
  const [salvando, setSalvando] = useState(false);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!conectada) return;
    const controller = new AbortController();
    apiClient.get<{ data: { contas: ContaDeAnuncio[]; conta_padrao: string | null } }>(
      "/api/v1/ads/meta/accounts", { signal: controller.signal, timeoutMs: 30_000, retry: false },
    ).then(({ data }) => {
      setContas(data.contas);
      setConta(data.conta_padrao ?? "");
    }).catch(() => {
      if (!controller.signal.aborted) setErro(t("Não consegui carregar as contas de anúncios. Tente novamente."));
    }).finally(() => {
      if (!controller.signal.aborted) setCarregando(false);
    });
    return () => controller.abort();
  }, [conectada, t, tentativa]);

  async function gerarLink() {
    setGerando(true);
    setErro(null);
    setAviso(null);
    setLink(null);
    try {
      const resposta = await apiClient.post<{ data: LinkDeConexao }>("/api/v1/ads/meta/oauth/links", {}, { retry: false });
      setLink(resposta.data);
    } catch {
      setErro(t("Não consegui gerar o link de conexão. Tente novamente."));
    } finally {
      setGerando(false);
    }
  }

  async function copiarLink() {
    if (!link) return;
    setErro(null);
    setAviso(null);
    if (await copyToClipboard(link.url)) {
      setAviso(t("Link de conexão copiado."));
    } else {
      setErro(t("Não consegui copiar automaticamente. Selecione e copie o link exibido."));
    }
  }

  async function salvarConta(evento: React.FormEvent) {
    evento.preventDefault();
    if (!conta) return;
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      await apiClient.patch("/api/v1/ads/meta/account", { default_account_id: conta }, { timeoutMs: 30_000, retry: false });
      setAviso(t("Conta padrão salva."));
      router.refresh();
    } catch {
      setErro(t("Não consegui salvar a conta padrão. Tente novamente."));
    } finally {
      setSalvando(false);
    }
  }

  if (!habilitada && !conectada) return null;

  return (
    <Card className="flex flex-col gap-5 p-6">
      {habilitada && (
        <>
          <div>
            <h2 className="font-semibold">{t("Conectar a conta de anúncios")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("Entre com o Facebook e autorize a leitura das contas de anúncios. Suas campanhas não serão alteradas.")}</p>
          </div>
          {resultado === "conectado" && <p role="status" className="text-sm">{t("Conexão autorizada. Escolha a conta de anúncios padrão abaixo.")}</p>}
          {resultado === "erro" && <p role="alert" className="text-sm text-destructive">{t("A autorização não foi concluída. Use Conectar com Facebook para começar novamente.")}</p>}
          {resultado === "cancelado" && <p role="status" className="text-sm">{t("A autorização foi cancelada. Use Conectar com Facebook para começar novamente.")}</p>}
          <div className="flex flex-wrap gap-3">
            <form method="post" action="/api/v1/ads/meta/oauth/connect">
              <Button type="submit">{t("Conectar com Facebook")}</Button>
            </form>
            <Button type="button" variant="outline" disabled={gerando} onClick={gerarLink}>
              {gerando ? t("Gerando link…") : t("Gerar link de conexão")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("Quem cuida dos seus anúncios pode autorizar pelo link sem entrar no CRM. Compartilhe somente com quem administra a conta de anúncios.")}</p>
          {link && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="meta_ads_connection_link">{t("Link para quem cuida dos anúncios")}</Label>
              <Input id="meta_ads_connection_link" name="meta_ads_connection_link" type="text" autoComplete="off" readOnly value={link.url} onFocus={(evento) => evento.target.select()} />
              <p className="text-xs text-muted-foreground">{t("Este link expira em {data}.").replace("{data}", new Date(link.expires_at).toLocaleString(idioma))}</p>
              <Button type="button" variant="outline" onClick={copiarLink}>{t("Copiar link")}</Button>
            </div>
          )}
        </>
      )}
      {conectada && (
        <form onSubmit={salvarConta} className="flex flex-col gap-3 border-t pt-5">
          <Label htmlFor="meta_ads_selected_account">{t("Conta de anúncios padrão")}</Label>
          {carregando ? <p role="status" className="text-sm">{t("Carregando contas de anúncios…")}</p> : (
            <>
              <select id="meta_ads_selected_account" name="meta_ads_selected_account" autoComplete="off" className="rounded-md border bg-background p-2 text-sm" value={conta} onChange={(evento) => setConta(evento.target.value)}>
                <option value="">{t("Escolha uma conta de anúncios")}</option>
                {contas.map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.id}</option>)}
              </select>
              {!contas.length && <p className="text-sm text-muted-foreground">{t("Nenhuma conta de anúncios disponível nesta autorização.")}</p>}
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={salvando || !contas.some((item) => item.id === conta)}>{salvando ? t("Salvando…") : t("Salvar conta padrão")}</Button>
                <Button type="button" variant="outline" onClick={() => { setErro(null); setCarregando(true); setTentativa((valor) => valor + 1); }}>{t("Atualizar contas de anúncios")}</Button>
              </div>
            </>
          )}
        </form>
      )}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {aviso && <p role="status" className="text-sm">{aviso}</p>}
    </Card>
  );
}
