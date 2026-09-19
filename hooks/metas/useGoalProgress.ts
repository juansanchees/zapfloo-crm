"use client";

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { GoalsCacheScope } from "./useGoals";

export interface GoalRevenueProgress {
  currency: string;
  current_cents: number;
  target_cents: number | null;
}

export interface GoalProgressRow {
  user_id: string;
  name: string | null;
  revenue: GoalRevenueProgress[];
  conversations: { current: number; target: number | null };
}

export interface GoalProgress {
  window: { from: string; to: string };
  scope: "self" | "team";
  team: Omit<GoalProgressRow, "user_id" | "name">;
  members: GoalProgressRow[];
}

export const GOAL_PROGRESS_QUERY_KEY = ({ orgId, userId, role }: GoalsCacheScope) =>
  ["operational-goals-progress", orgId, userId, role] as const;

export function useGoalProgress(scope: GoalsCacheScope) {
  return useQuery({
    queryKey: GOAL_PROGRESS_QUERY_KEY(scope),
    queryFn: async () => apiClient.get<{ data: GoalProgress }>("/api/v1/goals/progress"),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}
