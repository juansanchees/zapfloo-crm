"use client";

import Link from "next/link";
import { useState, type ComponentType, type ReactNode } from "react";

import { AiServiceStatus } from "@/components/ai/AiServiceStatus";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import type { DashboardCard, DashboardIcon, DashboardSurface } from "@/lib/dashboard/role-summary";
import type { DashboardWidgetId, DashboardWidgetSize } from "@/lib/dashboard/preferences";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import {
  ArrowRight,
  ArrowSquareOut,
  ChartLineUp,
  ChatsCircle,
  Clock,
  ListChecks,
  PencilSimple,
  Receipt,
  ShieldCheck,
  UserGear,
  Users,
  Warning,
  WhatsappLogo,
} from "@/lib/ui/icons";

import { useDashboard } from "./useDashboard";
import { DashboardCustomizer } from "./DashboardCustomizer";
import { useDashboardPreferences } from "./useDashboardPreferences";
import styles from "./dashboard.module.css";

const ICONS: Record<DashboardIcon, ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  users: Users,
  timer: Clock,
  chat: ChatsCircle,
  warning: Warning,
  money: Receipt,
  trend: ChartLineUp,
  receipt: Receipt,
  shield: ShieldCheck,
  whatsapp: WhatsappLogo,
  seat: UserGear,
};

function WidgetSlot({
  size,
  order,
  children,
}: {
  size: DashboardWidgetSize;
  order: number;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.widgetSlot} ${styles[`size_${size}`]}`} style={{ order }}>
      {children}
    </div>
  );
}

function Jump({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className={styles.jump} href={href}>
      {children}
      <ArrowRight size={15} aria-hidden />
    </Link>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.panel} aria-label={title}>
      <header className={styles.panelHead}>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function QueryState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: boolean;
  retry: () => unknown;
}) {
  const t = useT();
  if (loading)
    return (
      <p role="status" className={styles.muted}>
        {t("Carregando…")}
      </p>
    );
  if (error)
    return (
      <div role="alert">
        <p className={styles.muted}>{t("Não foi possível carregar esta seção.")}</p>
        <Button variant="ghost" size="sm" onClick={() => void retry()}>
          {t("Tentar novamente")}
        </Button>
      </div>
    );
  return null;
}

function SummaryCard({ metric }: { metric: DashboardCard }) {
  const t = useT();
  const Icon = ICONS[metric.icon];
  return (
    <article className={styles.summaryCard} aria-label={t(metric.label)}>
      <div className={styles.statTitle}>
        {t(metric.label)}
        <Icon size={18} aria-hidden />
      </div>
      <div className={styles.value} data-testid={`dashboard-value-${metric.id}`}>
        {metric.value}
      </div>
      <p>{t(metric.variation)}</p>
      <span className={styles.cardHint}>{t(metric.hint)}</span>
    </article>
  );
}

function actionFor(surface: DashboardSurface) {
  if (surface === "manager") return { href: "/app/kanban", label: "Abrir funis" };
  if (surface === "admin") return { href: "/app/connections", label: "Ver conexões" };
  return { href: "/app/inbox", label: "Abrir conversas" };
}

export function Dashboard() {
  const t = useT();
  const idioma = useIdioma();
  const d = useDashboard();
  const preferences = useDashboardPreferences();
  const [customizing, setCustomizing] = useState(false);
  if (!d.activeOrg)
    return (
      <section className={styles.dashboard}>
        <h1>{t("Vamos configurar seu negócio?")}</h1>
        <p>
          {t(
            "Você não tem nenhuma organização ativa. Configure sua organização ou aceite um convite.",
          )}
        </p>
        <Jump href="/get-started">{t("Configurar minha organização")}</Jump>
      </section>
    );

  const summary = d.summary.isError ? undefined : d.summary.data;
  const metrics = d.metrics.isError ? undefined : d.metrics.data;
  const stages = metrics?.funnel ?? [];
  const totalOpportunities = stages.reduce((total, stage) => total + stage.count, 0);
  const largestStage = Math.max(1, ...stages.map((stage) => stage.count));
  const won = metrics?.attendants.reduce((total, attendant) => total + attendant.won, 0);
  const lost = metrics?.attendants.reduce((total, attendant) => total + attendant.lost, 0);
  const decisions = (won ?? 0) + (lost ?? 0);
  const conversion = decisions > 0 ? Math.round(((won ?? 0) / decisions) * 100) : 0;
  const agents = (d.agents.data ?? []).filter((agent) => !agent.archived_at).slice(0, 3);
  const action = actionFor(summary?.role_surface ?? "agent");
  const tasks = [...(d.tasks.data ?? [])]
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    .slice(0, 3);
  const positioned = new Map(
    preferences.layout.widgets.map((widget, index) => [widget.id, { ...widget, index }]),
  );
  function place(id: DashboardWidgetId, child: ReactNode) {
    const widget = positioned.get(id);
    if (!widget?.visible) return null;
    return (
      <WidgetSlot key={id} size={widget.size} order={widget.index}>
        {child}
      </WidgetSlot>
    );
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.greeting}>
        <div>
          <p className={styles.eyebrow}>{t("SEU NEGÓCIO, MAIS PERTO.")}</p>
          <h1>{t("Vamos fazer o dia render?")}</h1>
          <p className={styles.muted}>{t("Métricas conforme suas permissões.")}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" className={styles.pill} onClick={() => setCustomizing(true)}>
            <PencilSimple aria-hidden />
            {t("Personalizar painel")}
          </Button>
          <Button asChild className={styles.pill} size="lg">
            <Link href={action.href}>
              {t(action.label)}
              <ArrowSquareOut aria-hidden />
            </Link>
          </Button>
        </div>
      </header>

      <AiServiceStatus canConfigure={d.canConfigureAiAccess} />
      {preferences.isError && (
        <div role="alert" className={styles.preferenceError}>
          <span>{t("Não foi possível carregar sua personalização.")}</span>
          <Button variant="ghost" size="sm" onClick={() => void preferences.refetch()}>
            {t("Tentar novamente")}
          </Button>
        </div>
      )}
      {d.canReadSummary && d.summary.isLoading && (
        <p role="status" className={styles.muted}>
          {t("Carregando métricas…")}
        </p>
      )}
      {d.canReadSummary && d.summary.isError && (
        <div role="alert" className={styles.error}>
          <span>{t("Não foi possível carregar as métricas do painel.")}</span>
          <Button variant="ghost" size="sm" onClick={() => void d.summary.refetch()}>
            {t("Tentar novamente")}
          </Button>
        </div>
      )}
      <div className={styles.columns}>
        {summary &&
          place(
            "conversation_summary",
            <section className={styles.summary} aria-label={t("Resumo operacional")}>
              <article className={styles.heroMetric} aria-label={t(summary.hero.label)}>
                <div>
                  <p className={styles.eyebrow}>{t(summary.hero.variation || "AGORA")}</p>
                  <h2>{t(summary.hero.label)}</h2>
                  <p className={styles.muted}>{t(summary.hero.hint)}</p>
                </div>
                <strong data-testid={`dashboard-value-${summary.hero.id}`}>
                  {summary.hero.value}
                </strong>
              </article>
              <div className={styles.summaryCards}>
                {summary.cards.map((metric) => (
                  <SummaryCard key={metric.id} metric={metric} />
                ))}
              </div>
            </section>,
          )}

        {place(
          "recent_conversations",
          <Panel
            title={t("Conversas recentes")}
            action={<Jump href="/app/inbox?filter=all">{t("Ver todas")}</Jump>}
          >
            <QueryState
              loading={d.conversations.isLoading}
              error={d.conversations.isError}
              retry={d.conversations.refetch}
            />
            {!d.conversations.isLoading &&
              !d.conversations.isError &&
              (d.conversations.data?.length ? (
                <ul className={styles.list}>
                  {d.conversations.data.map((conversation) => {
                    const name = rotuloDoContato(conversation.contacts, t);
                    return (
                      <li key={conversation.id}>
                        <Link
                          className={styles.conversation}
                          href={`/app/inbox?id=${encodeURIComponent(conversation.id)}`}
                        >
                          <span className={styles.avatar} aria-hidden>
                            {[...name].slice(0, 2).join("").toUpperCase()}
                          </span>
                          <span className={styles.person}>
                            <strong>{name}</strong>
                            <span>
                              {conversation.last_message_preview || t("Abra para ver a conversa")}
                            </span>
                          </span>
                          <ArrowRight size={16} aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className={styles.empty}>
                  <ChatsCircle size={26} aria-hidden />
                  <p>{t("Nenhuma conversa aberta por aqui.")}</p>
                  <Jump href="/app/inbox">{t("Ir para conversas")}</Jump>
                </div>
              ))}
          </Panel>,
        )}

        {place(
          "upcoming_work",
          <Panel
            title={t("Seu próximo passo")}
            action={<Jump href="/app/tasks">{t("Ver tarefas")}</Jump>}
          >
            <QueryState
              loading={d.tasks.isLoading}
              error={d.tasks.isError}
              retry={d.tasks.refetch}
            />
            {d.complete.isError && (
              <p role="alert" className={styles.error}>
                {t("Não foi possível concluir a tarefa. Tente novamente.")}
              </p>
            )}
            {!d.tasks.isLoading &&
              !d.tasks.isError &&
              (tasks.length ? (
                <ul className={styles.list}>
                  {tasks.map((task) => (
                    <li key={task.id} className={styles.task}>
                      {d.canAct && (
                        <input
                          type="checkbox"
                          checked={false}
                          disabled={d.complete.isPending}
                          aria-label={`${t("Concluir")} ${task.title}`}
                          onChange={() => d.complete.mutate(task.id)}
                        />
                      )}
                      <Link href="/app/tasks">
                        <strong>{task.title}</strong>
                        <span>
                          {task.due_date
                            ? new Date(task.due_date).toLocaleString(idioma, {
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : t("Sem prazo definido")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.empty}>
                  <ListChecks size={26} aria-hidden />
                  <p>{t("Nenhuma tarefa pendente. Combine o próximo passo com sua equipe.")}</p>
                  <Jump href="/app/tasks">{t("Organizar tarefas")}</Jump>
                </div>
              ))}
          </Panel>,
        )}
        {place(
          "service_queue",
          <Panel title={t("Fila de atendimento")}>
            <p className={styles.muted}>{t("Acompanhe a fila no resumo operacional.")}</p>
            <Jump href="/app/inbox?filter=unassigned">{t("Abrir fila")}</Jump>
          </Panel>,
        )}
        {d.canAct &&
          place(
            "opportunities_by_stage",
            <Panel
              title={t("Oportunidades por etapa")}
              action={<Jump href="/app/kanban">{t("Ver funis")}</Jump>}
            >
              <QueryState
                loading={d.metrics.isLoading}
                error={d.metrics.isError}
                retry={d.metrics.refetch}
              />
              {metrics && (
                <>
                  <p className={styles.muted}>{t("Oportunidades abertas conforme seu acesso.")}</p>
                  {stages.length ? (
                    <ul className={styles.funnel}>
                      {stages.map((stage) => (
                        <li key={stage.stage_id}>
                          <span>{stage.stage_name}</span>
                          <div className={styles.track} aria-hidden>
                            <div style={{ width: `${(stage.count / largestStage) * 100}%` }} />
                          </div>
                          <strong>{stage.count}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.empty}>{t("Nenhuma etapa configurada.")}</p>
                  )}
                  <div className={styles.total}>
                    <span>{t("Total em aberto")}</span>
                    <strong>{totalOpportunities}</strong>
                  </div>
                  <Jump href="/app/metrics">{t("Desempenho dos últimos 30 dias")}</Jump>
                </>
              )}
            </Panel>,
          )}
        {d.canAct &&
          place(
            "period_conversion",
            <Panel title={t("Conversão do período")}>
              <div className={styles.conversionMetric}>
                <strong>{metrics ? `${conversion}%` : "—"}</strong>
                <span>{t("oportunidades ganhas entre as decisões registradas")}</span>
              </div>
              <QueryState
                loading={d.metrics.isLoading}
                error={d.metrics.isError}
                retry={d.metrics.refetch}
              />
              <Jump href="/app/metrics">{t("Abrir relatório completo")}</Jump>
            </Panel>,
          )}
        {d.canManage &&
          place(
            "active_agents",
            <Panel title={t("Agentes ativos")}>
              <QueryState
                loading={d.agents.isLoading}
                error={d.agents.isError}
                retry={d.agents.refetch}
              />
              {!d.agents.isLoading &&
                !d.agents.isError &&
                (agents.length ? (
                  <ul className={styles.list}>
                    {agents.map((agent) => (
                      <li key={agent.id}>
                        <Link
                          className={styles.conversation}
                          href={`/app/ai/agents/${encodeURIComponent(agent.id)}`}
                        >
                          <span className={styles.avatar} aria-hidden>
                            {[...agent.name].slice(0, 2).join("").toUpperCase()}
                          </span>
                          <span className={styles.person}>
                            <strong>{agent.name}</strong>
                            <span>{agent.description || t("Agente de IA")}</span>
                          </span>
                          <span className={styles.badge}>
                            {agent.is_active ? t("Habilitado") : t("Desativado")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.empty}>{t("Nenhum agente configurado.")}</p>
                ))}
              <Jump href="/app/ai/agents">{t("Ver agentes")}</Jump>
            </Panel>,
          )}
        {place(
          "at_risk_clients",
          <Panel title={t("Clientes que precisam de atenção")}>
            <p className={styles.muted}>
              {t("Consulte conversas sem resposta e oportunidades que podem esfriar.")}
            </p>
            <Jump href="/app/radar">{t("Consultar radar")}</Jump>
          </Panel>,
        )}
      </div>
      <footer className={styles.footer}>
        {t("Informações conforme suas permissões. Atualização automática a cada 30 segundos.")}
      </footer>
      {customizing && (
        <DashboardCustomizer
          open
          onOpenChange={setCustomizing}
          layout={preferences.layout}
          saving={preferences.save.isPending}
          resetting={preferences.reset.isPending}
          onSave={(layout) => preferences.save.mutateAsync(layout)}
          onReset={() => preferences.reset.mutateAsync()}
        />
      )}
    </div>
  );
}
