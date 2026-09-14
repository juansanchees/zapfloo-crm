"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { TenantSubscription } from "@/hooks/useTenantDetail";

export function useUpdateTenantSubscription(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<TenantSubscription, "plan_id" | "status">) =>
      apiClient.patch<{ data: TenantSubscription }>(
        `/api/v1/admin/tenants/${organizationId}`,
        input,
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "tenant", organizationId] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] }),
      ]);
    },
  });
}
