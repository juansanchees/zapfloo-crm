"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useGoalProgress, type GoalProgressRow, type GoalRevenueProgress } from "@/hooks/metas/useGoalProgress";
import { useGoals, useUpdateGoals, type GoalsCacheScope } from "@/hooks/metas/useGoals";
import { useT } from "@/lib/i18n/IdiomaProvider";
import { emptyOperationalGoals, type OperationalGoals } from "@/lib/metas/config";

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value / 100);
  } catch {
    return `${currency} ${(value / 100).toFixed(2)}`;
  }
}

function optionalInteger(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function progressWidth(current: number, target: number | null) {
  if (target === null || target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

function MetricBar({
  label,
  current,
  target,
  format,
}: {
  label: string;
  current: number;
  target: number | null;
  format: (value: number) => string;
}) {
  const t = useT();

  return (
    <section className="rounded-xl border bg-card p-4" aria-label={label}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="text-sm tabular-nums text-muted-foreground">
          {format(current)}
          {target === null ? ` · ${t("Meta não definida")}` : ` de ${format(target)}`}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${progressWidth(current, target)}%` }} />
      </div>
    </section>
  );
}

function RevenueBars({ revenue }: { revenue: GoalRevenueProgress[] }) {
  const t = useT();

  if (revenue.length === 0) {
    return <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{t("Receita mensal")}: {t("Meta não definida")}</p>;
  }
  return revenue.map((entry) => (
    <MetricBar
      key={entry.currency}
      label={`${t("Receita mensal")} (${entry.currency})`}
      current={entry.current_cents}
      target={entry.target_cents}
      format={(value) => money(value, entry.currency)}
    />
  ));
}

function numberValue(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

function GoalsEditor({ initial, members, scope }: { initial: OperationalGoals; members: GoalProgressRow[]; scope: GoalsCacheScope }) {
  const t = useT();
  const updateGoals = useUpdateGoals(scope);
  const [draft, setDraft] = useState<OperationalGoals>(initial);
  const setTeam = (key: "monthly_revenue_cents" | "monthly_conversations", value: string) => {
    setDraft((current) => ({ ...current, team: { ...current.team, [key]: optionalInteger(value) } }));
  };
  const setMember = (userId: string, key: "monthly_revenue_cents" | "monthly_conversations", value: string) => {
    setDraft((current) => ({
      ...current,
      members: { ...current.members, [userId]: { ...current.members[userId], [key]: optionalInteger(value) } },
    }));
  };

  return (
    <section aria-labelledby="configurar-metas" className="rounded-xl border p-4">
      <h2 id="configurar-metas" className="text-base font-semibold">{t("Configurar metas")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("Deixe em branco o que não deve ter meta neste mês.")}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-sm">{t("Moeda da receita")}
          <input className="h-9 rounded-md border bg-background px-3" aria-label={t("Moeda da receita")} maxLength={3} value={draft.currency ?? ""} onChange={(event) => setDraft((current) => ({ ...current, currency: (event.target.value.toUpperCase() || undefined) as OperationalGoals["currency"] }))} />
        </label>
        <label className="grid gap-1 text-sm">{t("Receita mensal da equipe (centavos)")}
          <input className="h-9 rounded-md border bg-background px-3" aria-label={t("Receita mensal da equipe")} inputMode="numeric" value={numberValue(draft.team.monthly_revenue_cents)} onChange={(event) => setTeam("monthly_revenue_cents", event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm">{t("Conversas da equipe")}
          <input className="h-9 rounded-md border bg-background px-3" aria-label={t("Conversas da equipe")} inputMode="numeric" value={numberValue(draft.team.monthly_conversations)} onChange={(event) => setTeam("monthly_conversations", event.target.value)} />
        </label>
      </div>
      {members.map((member) => (
        <fieldset key={member.user_id} className="mt-4 grid gap-3 rounded-lg border p-3 md:grid-cols-2">
          <legend className="px-1 text-sm font-medium">{member.name ?? t("Atendente")}</legend>
          <label className="grid gap-1 text-sm">{t("Receita mensal (centavos)")}
            <input className="h-9 rounded-md border bg-background px-3" aria-label={`${t("Receita mensal de")} ${member.name ?? t("atendente")}`} inputMode="numeric" value={numberValue(draft.members[member.user_id]?.monthly_revenue_cents)} onChange={(event) => setMember(member.user_id, "monthly_revenue_cents", event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">{t("Conversas atendidas")}
            <input className="h-9 rounded-md border bg-background px-3" aria-label={`${t("Conversas de")} ${member.name ?? t("atendente")}`} inputMode="numeric" value={numberValue(draft.members[member.user_id]?.monthly_conversations)} onChange={(event) => setMember(member.user_id, "monthly_conversations", event.target.value)} />
          </label>
        </fieldset>
      ))}
      <Button className="mt-4" onClick={() => updateGoals.mutate(draft)} disabled={updateGoals.isPending}>{t("Salvar metas")}</Button>
    </section>
  );
}

export function MetasClient({ canManage, orgId, userId, role }: { canManage: boolean } & GoalsCacheScope) {
  const t = useT();
  const scope = { orgId, userId, role };
  const goalsQuery = useGoals(scope, canManage);
  const progressQuery = useGoalProgress(scope);
  const progress = progressQuery.data?.data;

  if (goalsQuery.isLoading || progressQuery.isLoading) {
    return <div className="space-y-3 p-6" aria-busy>{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-xl border bg-muted" />)}</div>;
  }
  if (goalsQuery.isError || progressQuery.isError || !progress) {
    return <p className="p-6 text-sm text-destructive">{t("Não foi possível carregar as metas operacionais.")}</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Metas operacionais")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("Acompanhe o mês pelo que já aconteceu na operação.")}</p>
      </header>

      <section aria-labelledby="resumo-operacional" className="space-y-3">
        <h2 id="resumo-operacional" className="text-base font-semibold">
          {progress.scope === "team" ? t("Resumo da equipe") : t("Seu resumo")}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <RevenueBars revenue={progress.team.revenue} />
          <MetricBar label={t("Conversas atendidas")} current={progress.team.conversations.current} target={progress.team.conversations.target} format={(value) => String(value)} />
        </div>
      </section>

      <section aria-labelledby="pessoas-da-equipe" className="space-y-3">
        <h2 id="pessoas-da-equipe" className="text-base font-semibold">{t("Pessoas")}</h2>
        <div className="space-y-3">
          {progress.members.map((member) => (
            <article key={member.user_id} className="rounded-xl border p-4">
              <h3 className="text-sm font-medium">{member.name ?? t("Atendente")}</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <RevenueBars revenue={member.revenue} />
                <MetricBar label={t("Conversas atendidas")} current={member.conversations.current} target={member.conversations.target} format={(value) => String(value)} />
              </div>
            </article>
          ))}
        </div>
      </section>

      {canManage && <GoalsEditor key={JSON.stringify(goalsQuery.data?.data ?? emptyOperationalGoals())} initial={goalsQuery.data?.data ?? emptyOperationalGoals()} members={progress.members} scope={scope} />}
    </div>
  );
}
