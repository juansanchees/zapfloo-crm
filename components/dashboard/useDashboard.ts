"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { roleAtLeast } from "@/lib/auth/types";
import type { DashboardSummary } from "@/lib/dashboard/role-summary";
import { useAuth } from "@/hooks/auth/AuthProvider";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";
import type { Tarefa } from "@/lib/tarefas/tipos";

/** A API decide a superfície; o cliente apenas a identifica e a exibe. */
export function useDashboard() {
  const { user, activeOrg } = useAuth();
  const qc = useQueryClient();
  const enabled = !!activeOrg;
  const canAct = enabled && (user.is_platform_admin || roleAtLeast(activeOrg.role, "agent"));
  const canConfigureAiAccess =
    enabled && (user.is_platform_admin || roleAtLeast(activeOrg.role, "admin"));
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

  const summary = useQuery({
    ...common,
    queryKey: [...scope, "summary"],
    queryFn: () =>
      apiClient
        .get<{ data: DashboardSummary }>("/api/v1/dashboard/summary")
        .then((response) => response.data),
  });
  const conversations = useQuery({
    ...common,
    queryKey: [...scope, "conversations"],
    queryFn: () =>
      apiClient
        .get<{ data: ConversationWithContact[] }>(
          "/api/v1/conversations?exclude_finished=true&limit=3",
        )
        .then((response) => response.data),
  });
  const tasks = useQuery({
    ...common,
    queryKey: [...scope, "tasks"],
    queryFn: () =>
      apiClient
        .get<{ data: { tasks: Tarefa[] } }>("/api/v1/tasks?aberto=true")
        .then((response) => response.data.tasks),
  });
  const complete = useMutation({
    mutationFn: (id: string) =>
      apiClient.patch(`/api/v1/tasks/${encodeURIComponent(id)}`, { status: "done" }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...scope, "tasks"] }),
        qc.invalidateQueries({ queryKey: ["crm_tasks"] }),
        qc.invalidateQueries({ queryKey: [...scope, "summary"] }),
      ]);
    },
  });

  return { activeOrg, canAct, canConfigureAiAccess, summary, conversations, tasks, complete };
}
