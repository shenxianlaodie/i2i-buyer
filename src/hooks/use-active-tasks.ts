"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import { toast } from "sonner";

/**
 * 全局活跃任务轮询 + 完成通知
 * 挂在 dashboard layout 中，跨页面不丢失任务状态
 */
export function useActiveTasks() {
  const trpc = useTRPC();
  const prevRef = useRef<Map<string, string>>(new Map());

  const query = useQuery({
    ...trpc.generation.getActiveTasks.queryOptions(),
    refetchInterval: (q) => {
      const hasActive = q.state.data?.some(
        (t) => t.status === "PENDING" || t.status === "QUEUED" || t.status === "PROCESSING",
      );
      return hasActive ? 3000 : false;
    },
    refetchOnWindowFocus: true,
    staleTime: 1000,
  });

  // 检测任务完成/失败
  useEffect(() => {
    if (!query.data) return;
    const current = new Map(query.data.map((t) => [t.id, t.status]));

    for (const [id, status] of current) {
      const prevStatus = prevRef.current.get(id);
      if (prevStatus && prevStatus !== status) {
        if (status === "COMPLETED") {
          const task = query.data.find((t) => t.id === id);
          toast.success("生成完成", {
            description: task?.prompt?.substring(0, 40) || undefined,
          });
        } else if (status === "FAILED") {
          const task = query.data.find((t) => t.id === id);
          toast.error(task?.errorMessage ?? "生成失败");
        }
      }
    }
    prevRef.current = current;
  }, [query.data]);

  return query;
}
