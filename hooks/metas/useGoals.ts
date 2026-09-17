"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { OperationalGoals } from "@/lib/metas/config";

export const GOALS_QUERY_KEY = ["operational-goals"] as const;

export function useGoals() {
  return useQuery({
    queryKey: GOALS_QUERY_KEY,
    queryFn: async () => apiClient.get<{ data: OperationalGoals }>("/api/v1/settings/goals"),
    staleTime: 15_000,
  });
}

export function useUpdateGoals() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OperationalGoals) =>
      apiClient.patch<{ data: OperationalGoals }>("/api/v1/settings/goals", input),
    onError: showApiError,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GOALS_QUERY_KEY }),
  });
}
