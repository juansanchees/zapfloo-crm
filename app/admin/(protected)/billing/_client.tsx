"use client";

import { useEffect, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";

type Review = {
  total_organizations: number;
  expired_count: number;
  legacy_count: number;
  paused_count: number;
  pending_count: number;
};
type Settings = {
  enforcement_enabled: boolean;
  can_mutate: boolean;
  updated_at: string | null;
  updated_by: string | null;
  review: Review;
};
type Organization = {
  organization_id: string;
  organization_name: string;
  organization_created_at: string;
  plan_id: string | null;
  status: string | null;
  billing_provider: string | null;
  last_payment_at: string | null;
  paid_through: string | null;
  access_until: string | null;
  subscription_updated_at: string | null;
  access_allowed: boolean;
  access_reason: string;
  review_required: boolean;
};
type Unmatched = {
  id: string;
  plan_id: string | null;
  target_status: string | null;
  buyer_email_masked: string | null;
  event_at: string;
  received_at: string;
};
type Envelope<T> = { data: T; meta?: { has_more?: boolean; cursor?: string | null } };

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json() as T & { error?: { code?: string; message?: string } };
  if (!response.ok) {
    const error = new Error(body.error?.message ?? "request_failed") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body;
}

function dateLabel(value: string | null, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(date)
    : "—";
}

export function BillingAdminClient() {
  const t = useT();
  const locale = useTagDeIdioma();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [unmatched, setUnmatched] = useState<Unmatched[]>([]);
  const [organizationsCursor, setOrganizationsCursor] = useState<string | null>(null);
  const [unmatchedCursor, setUnmatchedCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nextEnabled, setNextEnabled] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      readJson<Envelope<Settings>>("/api/v1/admin/billing/settings"),
      readJson<Envelope<Organization[]>>("/api/v1/admin/billing/organizations?limit=100"),
      readJson<Envelope<Unmatched[]>>("/api/v1/admin/billing/unmatched?limit=100"),
    ]).then(([settingsResponse, organizationsResponse, unmatchedResponse]) => {
      if (!active) return;
      setSettings(settingsResponse.data);
      setOrganizations(organizationsResponse.data);
      setUnmatched(unmatchedResponse.data);
      setOrganizationsCursor(organizationsResponse.meta?.has_more ? organizationsResponse.meta.cursor ?? null : null);
      setUnmatchedCursor(unmatchedResponse.meta?.has_more ? unmatchedResponse.meta.cursor ?? null : null);
    }).catch(() => {
      if (active) setError(t("Não foi possível carregar a operação de cobrança."));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [t]);

  const sortedOrganizations = useMemo(
    () => [...organizations].sort((a, b) => a.organization_name.localeCompare(b.organization_name, locale)),
    [locale, organizations],
  );

  function requestToggle(enabled: boolean) {
    if (!settings?.can_mutate) return;
    setNextEnabled(enabled);
    setDialogOpen(true);
  }

  async function confirmToggle() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      await readJson<Envelope<{ enforcement_enabled: boolean }>>("/api/v1/admin/billing/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          enforcement_enabled: nextEnabled,
          confirmation: nextEnabled ? "ATIVAR BLOQUEIO COMERCIAL" : "DESATIVAR BLOQUEIO COMERCIAL",
        }),
      });
      setSettings({ ...settings, enforcement_enabled: nextEnabled });
      setNotice(t(nextEnabled ? "Bloqueio comercial ativado." : "Bloqueio comercial desativado."));
      setDialogOpen(false);
    } catch {
      setError(t("Não foi possível alterar o bloqueio comercial."));
    } finally {
      setSaving(false);
    }
  }

  async function linkEvent(eventId: string) {
    const organizationId = selectedOrganization[eventId];
    if (!organizationId || !settings?.can_mutate) return;
    setLinking(eventId);
    setError(null);
    setNotice(null);
    try {
      await readJson<Envelope<{ status: string }>>(`/api/v1/admin/billing/unmatched/${eventId}/link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          reason: "Conciliação manual pelo painel de cobrança",
        }),
      });
      setUnmatched((current) => current.filter((item) => item.id !== eventId));
      setNotice(t("Compra vinculada e assinatura atualizada."));
      const [refreshedSettings, refreshedOrganizations] = await Promise.all([
        readJson<Envelope<Settings>>("/api/v1/admin/billing/settings"),
        readJson<Envelope<Organization[]>>("/api/v1/admin/billing/organizations?limit=100"),
      ]);
      setSettings(refreshedSettings.data);
      setOrganizations(refreshedOrganizations.data);
      setOrganizationsCursor(refreshedOrganizations.meta?.has_more
        ? refreshedOrganizations.meta.cursor ?? null
        : null);
    } catch (cause) {
      const status = cause instanceof Error && "status" in cause
        ? (cause as Error & { status?: number }).status
        : undefined;
      setError(t(status === 409
        ? "Esta compra já foi conciliada por outra ação."
        : "Não foi possível vincular esta compra."));
    } finally {
      setLinking(null);
    }
  }

  async function loadMoreOrganizations() {
    if (!organizationsCursor) return;
    const next = await readJson<Envelope<Organization[]>>(
      `/api/v1/admin/billing/organizations?limit=100&cursor=${encodeURIComponent(organizationsCursor)}`,
    );
    setOrganizations((current) => [...current, ...next.data]);
    setOrganizationsCursor(next.meta?.has_more ? next.meta.cursor ?? null : null);
  }

  async function loadMoreUnmatched() {
    if (!unmatchedCursor) return;
    const next = await readJson<Envelope<Unmatched[]>>(
      `/api/v1/admin/billing/unmatched?limit=100&cursor=${encodeURIComponent(unmatchedCursor)}`,
    );
    setUnmatched((current) => [...current, ...next.data]);
    setUnmatchedCursor(next.meta?.has_more ? next.meta.cursor ?? null : null);
  }

  if (loading) {
    return <div className="space-y-4" aria-label={t("Carregando cobrança")}><Skeleton className="h-24" /><Skeleton className="h-56" /></div>;
  }
  if (!settings) {
    return <p role="alert" className="text-sm text-error-fg">{error ?? t("Cobrança indisponível.")}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[.12em] text-accent">{t("Operação financeira")}</p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight">{t("Cobrança")}</h1>
        <p className="mt-1 text-sm text-text-muted">{t("Revise o impacto, concilie compras e controle o bloqueio comercial.")}</p>
      </div>

      {error ? <p role="alert" className="rounded-md border border-error-fg/30 bg-error-bg p-3 text-sm text-error-fg">{error}</p> : null}
      {notice ? <p role="status" className="rounded-md border border-success-fg/30 bg-success-bg p-3 text-sm text-success-fg">{notice}</p> : null}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <p className="text-xs font-medium uppercase tracking-[.12em] text-accent">{t("Interruptor global")}</p>
            <CardTitle className="mt-2">{t("Aplicar bloqueio comercial")}</CardTitle>
            <CardDescription className="mt-1">{t("Quando ligado, organizações vencidas deixam de produzir saídas. Mensagens recebidas continuam guardadas.")}</CardDescription>
          </div>
          <Switch aria-label={t("Aplicar bloqueio comercial")} checked={settings.enforcement_enabled} disabled={!settings.can_mutate || saving} onCheckedChange={requestToggle} />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant={settings.enforcement_enabled ? "warning" : "neutral"}>{t(settings.enforcement_enabled ? "Bloqueio ligado" : "Bloqueio desligado")}</Badge>
          {!settings.can_mutate ? <Badge variant="neutral">{t("Somente leitura")}</Badge> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-[.12em] text-accent">{t("Conciliação")}</p>
          <CardTitle>{t("Compras sem organização")}</CardTitle>
          <CardDescription>{t("Escolha a organização correta. O vínculo projeta a assinatura em uma única operação.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {unmatched.length === 0 ? <p className="text-sm text-text-muted">{t("Nenhuma compra pendente.")}</p> : unmatched.map((event) => (
            <div key={event.id} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
              <div className="min-w-0"><p className="font-medium">{event.buyer_email_masked ?? t("Comprador não identificado")}</p><p className="text-xs text-text-muted">{t("Plano")}: {event.plan_id ?? "—"} · {dateLabel(event.received_at, locale)}</p></div>
              <label className="grid gap-1 text-xs text-text-muted">{t("Organização para vincular")}
                <select aria-label={t("Organização para vincular")} value={selectedOrganization[event.id] ?? ""} disabled={!settings.can_mutate || linking === event.id} onChange={(input) => setSelectedOrganization((current) => ({ ...current, [event.id]: input.target.value }))} className="h-9 rounded-md border border-border bg-surface px-3 text-sm text-text focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-[.45]">
                  <option value="">{t("Selecione uma organização")}</option>
                  {sortedOrganizations.map((organization) => <option key={organization.organization_id} value={organization.organization_id}>{organization.organization_name}</option>)}
                </select>
              </label>
              <Button disabled={!settings.can_mutate || !selectedOrganization[event.id] || linking === event.id} onClick={() => void linkEvent(event.id)}>{t(linking === event.id ? "Vinculando…" : "Vincular compra")}</Button>
            </div>
          ))}
          {unmatchedCursor ? <Button variant="outline" onClick={() => void loadMoreUnmatched()}>{t("Carregar mais compras")}</Button> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><p className="text-xs font-medium uppercase tracking-[.12em] text-accent">{t("Revisão")}</p><CardTitle>{t("Organizações e assinaturas")}</CardTitle><CardDescription>{t("Datas ausentes ficam visíveis como legado e nunca são tratadas como pagamento confirmado.")}</CardDescription></CardHeader>
        <CardContent><Table><TableHeader><TableRow>
          <TableHead>{t("Organização")}</TableHead><TableHead>{t("Plano")}</TableHead><TableHead>{t("Status")}</TableHead><TableHead>{t("Cadastro")}</TableHead><TableHead>{t("Último pagamento")}</TableHead><TableHead>{t("Pago até")}</TableHead><TableHead>{t("Acesso até")}</TableHead><TableHead>{t("Revisão")}</TableHead>
        </TableRow></TableHeader><TableBody>{organizations.map((organization) => <TableRow key={organization.organization_id}>
          <TableCell className="font-medium">{organization.organization_name}</TableCell><TableCell>{organization.plan_id ?? t("Sem plano registrado")}</TableCell><TableCell>{organization.status ?? t("Sem assinatura")}</TableCell><TableCell>{dateLabel(organization.organization_created_at, locale)}</TableCell><TableCell>{dateLabel(organization.last_payment_at, locale)}</TableCell><TableCell>{dateLabel(organization.paid_through, locale)}</TableCell><TableCell>{dateLabel(organization.access_until, locale)}</TableCell><TableCell>{organization.review_required ? <Badge variant="warning">{t("Revisão necessária")}</Badge> : <Badge variant="success">{t("Conferida")}</Badge>}</TableCell>
        </TableRow>)}</TableBody></Table></CardContent>
        {organizationsCursor ? <div className="px-6 pb-6"><Button variant="outline" onClick={() => void loadMoreOrganizations()}>{t("Carregar mais organizações")}</Button></div> : null}
      </Card>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent><AlertDialogHeader>
          <AlertDialogTitle>{t(nextEnabled ? "Ativar bloqueio comercial?" : "Desativar bloqueio comercial?")}</AlertDialogTitle>
          <AlertDialogDescription asChild><div className="space-y-3"><p>{t("Esta confirmação não altera nenhuma assinatura.")}</p><ul className="list-disc space-y-1 pl-5 text-left"><li>{settings.review.expired_count} {t(settings.review.expired_count === 1 ? "organização vencida" : "organizações vencidas")}</li><li>{settings.review.legacy_count} {t(settings.review.legacy_count === 1 ? "organização legada" : "organizações legadas")}</li><li>{settings.review.paused_count} {t(settings.review.paused_count === 1 ? "organização pausada" : "organizações pausadas")}</li><li>{settings.review.pending_count} {t(settings.review.pending_count === 1 ? "compra pendente" : "compras pendentes")}</li></ul></div></AlertDialogDescription>
        </AlertDialogHeader><AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>{t("Cancelar")}</AlertDialogCancel>
          <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void confirmToggle(); }}>{t(nextEnabled ? "Confirmar e ativar" : "Confirmar e desativar")}</AlertDialogAction>
        </AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
