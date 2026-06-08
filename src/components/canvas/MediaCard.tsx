"use client";

import { cn } from "@/lib/utils";
import { Check, Trash2, Maximize2, Download, Loader2, RotateCcw, X } from "lucide-react";
import type { CanvasMedia } from "@/store/canvas-store";
import { useCanvasStore } from "@/store/canvas-store";
import { downloadImage } from "@/lib/download-helper";

export function MediaCard({
  item,
  onDelete,
  onPreview,
  onRetry,
}: {
  item: CanvasMedia;
  onDelete?: (item: CanvasMedia) => void;
  onPreview?: (item: CanvasMedia) => void;
  onRetry?: (item: CanvasMedia) => void;
}) {
  const selectedId = useCanvasStore((s) => s.selectedId);
  const select = useCanvasStore((s) => s.select);
  const isSelected = selectedId === item.id;

  const isQueued = item.generationStatus === "QUEUED";
  const isGenerating = item.generationStatus === "GENERATING";
  const isFailed = item.generationStatus === "FAILED";

  return (
    <button
      type="button"
      onClick={() => select(isSelected ? null : item.id)}
      className={cn(
        "group relative w-full overflow-hidden rounded-lg bg-zinc-900 text-left outline-none transition-all",
        isSelected && "ring-2 ring-blue-500 ring-offset-2 ring-offset-zinc-950",
      )}
    >
      <div className="relative aspect-[4/5] w-full">
        {isQueued ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-950 text-center text-white/80">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-400/70">
              <Loader2 className="size-7 animate-spin text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium">排队中...</p>
              <p className="text-xs text-zinc-500">前方任务完成后自动开始</p>
            </div>
          </div>
        ) : isGenerating ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-950 text-center text-white/80">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-blue-400/70">
              <Loader2 className="size-7 animate-spin text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium">生成中...</p>
              <p className="text-xs text-zinc-500">请稍候，生成结果即将出现</p>
            </div>
          </div>
        ) : isFailed ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-zinc-950 text-center text-white/80">
            <span className="text-3xl">⚠️</span>
            <div>
              <p className="text-sm font-medium">生成失败</p>
              <p className="text-xs text-zinc-500">请稍后重试</p>
            </div>
            {/* 失败卡片：✕ 删除按钮 */}
            {onDelete && (
              <span
                role="button" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onDelete(item); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onDelete(item); } }}
                className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-red-600/80 text-white hover:bg-red-500 transition-colors"
                title="删除此失败记录"
              >
                <X className="size-3.5" />
              </span>
            )}
            {/* 失败卡片：重试按钮 */}
            {onRetry && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRetry(item); }}
                className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-blue-600/80 px-3 py-1.5 text-xs text-white hover:bg-blue-500 transition-colors"
              >
                <RotateCcw className="size-3" />
                重试
              </button>
            )}
          </div>
        ) : item.type === "VIDEO" ? (
          <video
            src={item.url}
            className="size-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={item.thumbnailUrl || item.url}
            alt={item.prompt}
            className="size-full object-cover"
            loading="lazy"
          />
        )}
        {isSelected && (
          <div className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-blue-500 text-white">
            <Check className="size-3.5" />
          </div>
        )}
        {/* 正常卡片悬浮操作层（排队中/生成中/失败时隐藏，避免挡住状态按钮） */}
        {!isQueued && !isGenerating && !isFailed && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
            <div className="absolute top-2 right-2 flex items-center gap-1">
            {onPreview && (
              <span
                role="button" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); onPreview(item); }}
                className="flex size-7 items-center justify-center rounded-full bg-zinc-800 text-white hover:bg-zinc-700"
                title="查看大图"
              >
                <Maximize2 className="size-3.5" />
              </span>
            )}
            {item.originalUrl && (
              <span
                role="button" tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  downloadImage(item.originalUrl!);
                }}
                className="flex size-7 items-center justify-center rounded-full bg-zinc-800 text-white hover:bg-zinc-700"
                title="下载原图"
              >
                <Download className="size-3.5" />
              </span>
            )}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(item);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  onDelete?.(item);
                }
              }}
              className="flex size-7 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500"
              title="删除"
            >
              <Trash2 className="size-3.5" />
            </span>
          </div>
          <div className="absolute bottom-0 inset-x-0 px-3 py-2">
            <p className="truncate text-xs text-white/90">{item.prompt}</p>
            {item.userName && (
              <p className="text-[10px] text-zinc-400">{item.userName}</p>
            )}
          </div>
        </div>
        )}
      </div>
    </button>
  );
}
