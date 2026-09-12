"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { roleAtLeast } from "@/lib/auth/types";
import { useAuth } from "@/hooks/auth/AuthProvider";
import type { ConversationCounts } from "@/hooks/inbox/useConversationCounts";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import type { AttendantMetrics } from "@/hooks/metrics/useAttendantMetrics";
import type { AgentRow } from "@/hooks/ai/useAgent";
import type { Tarefa } from "@/lib/tarefas/tipos";

/** Só consome as APIs existentes: nenhuma nova regra de escopo ou consulta privilegiada. */
export function useDashboard() {
  const { user, activeOrg } = useAuth();
  const qc = useQueryClient();
  const enabled = !!activeOrg;
  const canAct = enabled && (user.is_platform_admin || roleAtLeast(activeOrg.role, "agent"));
  const canManage = enabled && (user.is_platform_admin || roleAtLeast(activeOrg.role, "manager"));
  // O cache também pertence à identidade e à organização, inclusive após troca de papel.
  const scope = [
    "dashboard",
    activeOrg?.orgId,
    user.id,
    activeOrg?.role,
    user.is_platform_admin,
  ] as const;
  const common = {
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled,
  };
  const counts = useQuery({
    ...common,
    queryKey: [...scope, "counts"],
    queryFn: () =>
      apiClient
        .get<{ data: ConversationCounts }>("/api/v1/conversations/counts")
        .then((r) => r.data),
  });
  const conversations = useQuery({
    ...common,
    queryKey: [...scope, "conversations"],
    queryFn: () =>
      apiClient
        .get<{ data: ConversationWithContact[] }>(
          "/api/v1/conversations?exclude_finished=true&limit=3",
        )
        .then((r) => r.data),
  });
  const metrics = useQuery({
    ...common,
    enabled: canAct,
    queryKey: [...scope, "metrics"],
    queryFn: () =>
      apiClient.get<{ data: AttendantMetrics }>("/api/v1/metrics/attendants").then((r) => r.data),
  });
  const agents = useQuery({
    ...common,
    enabled: canManage,
    queryKey: [...scope, "agents"],
    queryFn: () => apiClient.get<{ data: AgentRow[] }>("/api/v1/ai/agents").then((r) => r.data),
  });
  const tasks = useQuery({
    ...common,
    queryKey: [...scope, "tasks"],
    queryFn: () =>
      apiClient
        .get<{ data: { tasks: Tarefa[] } }>("/api/v1/tasks?aberto=true")
        .then((r) => r.data.tasks),
  });
  const complete = useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/api/v1/tasks/${encodeURIComponent(id)}`, { status: "done" }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...scope, "tasks"] }),
        qc.invalidateQueries({ queryKey: ["crm_tasks"] }),
      ]);
    },
  });
  return { counts, conversations, metrics, agents, tasks, complete, canAct, canManage, activeOrg };
}
