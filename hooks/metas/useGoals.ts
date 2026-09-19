"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { OperationalGoals } from "@/lib/metas/config";
import { GOAL_PROGRESS_QUERY_KEY } from "./useGoalProgress";

export interface GoalsCacheScope {
  orgId: string;
  userId: string;
  role: string;
}

export const goalsQueryKey = ({ orgId, userId, role }: GoalsCacheScope) =>
  ["operational-goals", orgId, userId, role] as const;

export function useGoals(scope: GoalsCacheScope, enabled: boolean) {
  return useQuery({
    queryKey: goalsQueryKey(scope),
    queryFn: async () => apiClient.get<{ data: OperationalGoals }>("/api/v1/settings/goals"),
    staleTime: 15_000,
    enabled,
  });
}

export function useUpdateGoals(scope: GoalsCacheScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OperationalGoals) =>
      apiClient.patch<{ data: OperationalGoals }>("/api/v1/settings/goals", input),
    onError: showApiError,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: goalsQueryKey(scope) }),
      queryClient.invalidateQueries({ queryKey: GOAL_PROGRESS_QUERY_KEY(scope) }),
    ]),
  });
}
