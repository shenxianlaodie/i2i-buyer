"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";

export function useAdminModels() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.admin.getModelSettings.queryOptions(),
  );

  return {
    imageModelId: data?.imageModelId ?? null,
    videoModelId: data?.videoModelId ?? null,
    textModelId: data?.textModelId ?? null,
    isLoading,
  };
}
