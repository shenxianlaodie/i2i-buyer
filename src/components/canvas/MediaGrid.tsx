"use client";

import { useMemo } from "react";
import { useCanvasStore, type CanvasMedia } from "@/store/canvas-store";
import { MediaCard } from "./MediaCard";

/** 失败卡片超过此时间（ms）自动消隐 */
const FAILED_TTL_MS = 5 * 60 * 1000; // 5 分钟

export function MediaGrid({
  onDelete,
  onPreview,
  onRetry,
}: {
  onDelete?: (item: CanvasMedia) => void;
  onPreview?: (item: CanvasMedia) => void;
  onRetry?: (item: CanvasMedia) => void;
}) {
  const items = useCanvasStore((s) => s.items);
  const filter = useCanvasStore((s) => s.filter);
  const search = useCanvasStore((s) => s.search);

  const filtered = useMemo(() => {
    const now = Date.now();
    return items.filter((it) => {
      if (filter === "image" && it.type !== "IMAGE") return false;
      if (filter === "video" && it.type !== "VIDEO") return false;
      if (search && !it.prompt.toLowerCase().includes(search.toLowerCase()))
        return false;

      // 失败卡片 TTL 自动消隐：超过 5 分钟自动隐藏
      if (it.generationStatus === "FAILED") {
        const failedAt = it.failedAt ?? new Date(it.createdAt).getTime();
        if (now - failedAt > FAILED_TTL_MS) return false;
      }

      return true;
    });
  }, [items, filter, search]);

  return (
    <div className="grid gap-3 p-4 columns-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {filtered.map((item) => (
        <div key={item.id} className="mb-3">
          <MediaCard item={item} onDelete={onDelete} onPreview={onPreview} onRetry={onRetry} />
        </div>
      ))}
      {filtered.length === 0 && (
        <p className="col-span-full py-20 text-center text-zinc-500">
          暂无素材
        </p>
      )}
    </div>
  );
}
