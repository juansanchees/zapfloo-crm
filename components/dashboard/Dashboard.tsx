"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowSquareOut,
  ChatsCircle,
  Gauge,
  ListChecks,
  Sparkle,
} from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { useDashboard } from "./useDashboard";
import styles from "./dashboard.module.css";

function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.panel} ${className}`} aria-label={title}>
      <header className={styles.panelHead}>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
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

function Stat({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <article className={styles.stat} aria-label={title}>
      <div className={styles.statTitle}>
        {title}
        {icon}
      </div>
      <div className={styles.value}>{value}</div>
      <p>{detail}</p>
    </article>
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

export function Dashboard() {
  const t = useT();
  const idioma = useIdioma();
  const d = useDashboard();
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

  // Erro de atualização não é zero, nem sucesso antigo pintado como informação atual.
  const counts = d.counts.isError ? undefined : d.counts.data;
  const metrics = d.metrics.isError ? undefined : d.metrics.data;
  const queue = counts?.fila ?? counts?.unassigned;
  const won = metrics?.attendants.reduce((sum, a) => sum + a.won, 0);
  const stages = metrics?.funnel ?? [];
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  const maximum = Math.max(1, ...stages.map((s) => s.count));
  const tasks = [...(d.tasks.data ?? [])]
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    .slice(0, 3);
  const agents = (d.agents.data ?? []).filter((a) => !a.archived_at).slice(0, 3);
  return (
    <div className={styles.dashboard}>
      <header className={styles.greeting}>
        <div>
          <p className={styles.eyebrow}>{t("SEU NEGÓCIO, MAIS PERTO.")}</p>
          <h1>{t("Vamos fazer o dia render?")}</h1>
          <p className={styles.muted}>
            {t("Conversas que avançam. Oportunidades que não se perdem.")}
          </p>
        </div>
        <Button asChild className={styles.pill} size="lg">
          <Link href="/app/inbox">
            {t("Abrir conversas")}
            <ArrowSquareOut aria-hidden />
          </Link>
        </Button>
      </header>
      <div className={styles.stats}>
        <Stat
          title={t("Conversas registradas")}
          value={counts?.all ?? "—"}
          detail={t("Todo o histórico ao qual você tem acesso")}
          icon={<ChatsCircle size={18} aria-hidden />}
        />
        <Stat
          title={t("Na fila")}
          value={queue ?? "—"}
          detail={t("Esperando um atendente no seu escopo")}
          icon={<Gauge size={18} aria-hidden />}
        />
        <Stat
          title={t("Com você")}
          value={counts?.mine ?? "—"}
          detail={t("Conversas atribuídas a você e abertas")}
          icon={<ListChecks size={18} aria-hidden />}
        />
        {d.canAct ? (
          <Stat
            title={t("Oportunidades ganhas")}
            value={won ?? "—"}
            detail={t("Com responsável · últimos 30 dias")}
            icon={<Sparkle size={18} aria-hidden />}
          />
        ) : (
          <Stat
            title={t("Tarefas pendentes")}
            value={d.tasks.isError || !d.tasks.data ? "—" : d.tasks.data.length >= 500 ? "500+" : d.tasks.data.length}
            detail={t("Pendentes ou em andamento")}
            icon={<ListChecks size={18} aria-hidden />}
          />
        )}
      </div>
      {d.counts.isError && (
        <div role="alert" className={styles.error}>
          <span>{t("Não foi possível carregar as contagens.")}</span>
          <Button variant="ghost" size="sm" onClick={() => void d.counts.refetch()}>
            {t("Tentar novamente")}
          </Button>
        </div>
      )}
      {d.counts.isLoading && (
        <p role="status" className={styles.muted}>
          {t("Carregando contagens…")}
        </p>
      )}
      <div className={styles.columns}>
        <div className={styles.stack}>
          <section className={styles.attention} aria-label={t("Sua fila de atendimento")}>
            <div>
              <p className={styles.eyebrow}>{t("AGORA É COM VOCÊ")}</p>
              <h2>
                {queue === undefined
                  ? t("Acompanhe sua fila de atendimento")
                  : queue === 0
                    ? t("Sua fila está em dia")
                    : `${queue} ${t("na fila de atendimento")}`}
              </h2>
              <p>
                {queue === 0
                  ? t("Aproveite para acompanhar suas oportunidades e próximos passos.")
                  : t("Seu próximo bom atendimento começa com quem está esperando.")}
              </p>
              <Button asChild className={styles.pill}>
                <Link href="/app/inbox?filter=unassigned">
                  {t("Abrir fila")}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
            <span className={styles.orb} aria-hidden>
              {queue ?? "—"}
            </span>
          </section>
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
                  {d.conversations.data.map((c) => {
                    const name =
                      c.contacts?.display_name || c.contacts?.name || t("Contato sem nome");
                    return (
                      <li key={c.id}>
                        <Link
                          className={styles.conversation}
                          href={`/app/inbox?id=${encodeURIComponent(c.id)}`}
                        >
                          <span className={styles.avatar} aria-hidden>
                            {[...name].slice(0, 2).join("").toUpperCase()}
                          </span>
                          <span className={styles.person}>
                            <strong>{name}</strong>
                            <span>{c.last_message_preview || t("Abra para ver a conversa")}</span>
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
          </Panel>
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
          </Panel>
        </div>
        <div className={styles.stack}>
          {d.canAct && (
            <Panel
              title={t("Seu funil em movimento")}
              action={<Jump href="/app/kanban">{t("Ver funis")}</Jump>}
            >
              <QueryState
                loading={d.metrics.isLoading}
                error={d.metrics.isError}
                retry={d.metrics.refetch}
              />
              {metrics && (
                <>
                  <p className={styles.muted}>{t("Oportunidades abertas · conforme seu acesso")}</p>
                  {stages.length ? (
                    <ul className={styles.funnel}>
                      {stages.map((s) => (
                        <li key={s.stage_id}>
                          <span>{s.stage_name}</span>
                          <div className={styles.track} aria-hidden>
                            <div style={{ width: `${(s.count / maximum) * 100}%` }} />
                          </div>
                          <strong>{s.count}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.empty}>{t("Nenhuma etapa configurada.")}</p>
                  )}
                  <div className={styles.total}>
                    <span>{t("Total em aberto")}</span>
                    <strong>{total}</strong>
                  </div>
                  <Jump href="/app/metrics">{t("Desempenho dos últimos 30 dias")}</Jump>
                </>
              )}
            </Panel>
          )}
          {d.canManage && (
            <Panel title={t("IA com o seu jeito")} action={<Sparkle size={20} aria-hidden />}>
              <p className={styles.muted}>
                {t("Você cuida da estratégia. Seu agente ajuda nas conversas.")}
              </p>
              <QueryState
                loading={d.agents.isLoading}
                error={d.agents.isError}
                retry={d.agents.refetch}
              />
              {!d.agents.isLoading &&
                !d.agents.isError &&
                (agents.length ? (
                  <ul className={styles.list}>
                    {agents.map((a) => (
                      <li key={a.id}>
                        <Link
                          className={styles.conversation}
                          href={`/app/ai/agents/${encodeURIComponent(a.id)}`}
                        >
                          <span className={styles.avatar} aria-hidden>
                            {[...a.name].slice(0, 2).join("").toUpperCase()}
                          </span>
                          <span className={styles.person}>
                            <strong>{a.name}</strong>
                            <span>{a.description || t("Agente de IA")}</span>
                          </span>
                          <span className={styles.badge}>
                            {a.is_active ? t("Habilitado") : t("Desativado")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.empty}>
                    {t("Seu primeiro agente começa com o jeito do seu negócio.")}
                  </p>
                ))}
              <Jump href="/app/ai/agents">{t("Ver agentes")}</Jump>
            </Panel>
          )}
          <Panel title={t("Seu dia, organizado")}>
            <p className={styles.muted}>
              {t("Veja os compromissos e retome conversas que precisam de atenção.")}
            </p>
            <div className={styles.shortcuts}>
              <Jump href="/app/agenda">{t("Abrir agenda")}</Jump>
              <Jump href="/app/radar">{t("Consultar radar")}</Jump>
            </div>
          </Panel>
        </div>
      </div>
      <footer className={styles.footer}>
        {t("Informações conforme suas permissões. Atualização automática a cada 30 segundos.")}
      </footer>
    </div>
  );
}
