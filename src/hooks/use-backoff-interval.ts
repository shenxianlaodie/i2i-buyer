"use client";

import { useState, useEffect, useRef } from "react";

/**
 * 指数退避轮询间隔 Hook
 *
 * 从 1s 开始，每 10s 翻倍一次，最大 10s 间隔。
 * 适用于 AI 生成任务的状态轮询，减少长任务的服务端压力。
 *
 * @param enabled - 是否启用轮询
 * @returns 当前轮询间隔（毫秒）
 */
export function useBackoffInterval(enabled: boolean): number {
  const [intervalMs, setIntervalMs] = useState(1000);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      startRef.current = null;
      setIntervalMs(1000);
      return;
    }

    if (startRef.current === null) {
      startRef.current = Date.now();
    }

    const tick = window.setInterval(() => {
      const elapsed = Date.now() - (startRef.current ?? Date.now());
      const next =
        elapsed < 10_000 ? 1000 :
        elapsed < 30_000 ? 2000 :
        elapsed < 70_000 ? 4000 :
        elapsed < 150_000 ? 8000 :
        10_000;
      setIntervalMs(next);
    }, 1000);

    return () => clearInterval(tick);
  }, [enabled]);

  return intervalMs;
}
