"use client";

import { useActiveTasks } from "@/hooks/use-active-tasks";

/** 挂载全局任务轮询，跨页面不丢失 */
export function ActiveTaskMonitor() {
  useActiveTasks();
  return null;
}
