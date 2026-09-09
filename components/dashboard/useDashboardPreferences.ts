"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { apiClient } from "@/lib/api/client";
import { type DashboardLayout, sanitizeDashboardLayout } from "@/lib/dashboard/preferences";

interface PreferencesResponse {
  data: { layout: DashboardLayout; source: "default" | "saved" };
}

export function useDashboardPreferences() {
  const { user, activeOrg } = useAuth();
  const queryClient = useQueryClient();
  const role = activeOrg?.role ?? "viewer";
  const key = ["dashboard-preferences", activeOrg?.orgId, user.id, role] as const;
  const query = useQuery({
    queryKey: key,
    enabled: !!activeOrg,
    staleTime: 60_000,
    queryFn: () =>
      apiClient
        .get<PreferencesResponse>("/api/v1/dashboard/preferences")
        .then((response) => response.data),
  });
  const save = useMutation({
    mutationFn: (layout: DashboardLayout) =>
      apiClient.put<PreferencesResponse>("/api/v1/dashboard/preferences", layout),
    onSuccess: async (response) => {
      queryClient.setQueryData(key, response.data);
    },
  });
  const reset = useMutation({
    mutationFn: () => apiClient.delete<PreferencesResponse>("/api/v1/dashboard/preferences"),
    onSuccess: async (response) => {
      queryClient.setQueryData(key, response.data);
    },
  });
  const layout = useMemo(
    () => sanitizeDashboardLayout(query.data?.layout, role),
    [query.data?.layout, role],
  );

  return {
    ...query,
    layout,
    source: query.data?.source ?? "default",
    save,
    reset,
  };
}
