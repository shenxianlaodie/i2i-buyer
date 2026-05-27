"use client";

import { cn } from "@/lib/utils";
import { Heart, RefreshCw, MoreHorizontal, Check } from "lucide-react";
import type { CanvasMedia } from "@/store/canvas-store";
import { useCanvasStore } from "@/store/canvas-store";

export function MediaCard({ item }: { item: CanvasMedia }) {
  const selectedId = useCanvasStore((s) => s.selectedId);
  const select = useCanvasStore((s) => s.select);
  const toggleFavorite = useCanvasStore((s) => s.toggleFavorite);
  const isSelected = selectedId === item.id;

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
        {item.type === "VIDEO" ? (
          <video
            src={item.url}
            className="size-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={item.url}
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="absolute top-2 right-2 flex gap-1">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(item.id);
              }}
              onKeyDown={(e) => e.key === "Enter" && toggleFavorite(item.id)}
              className="flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
            >
              <Heart
                className={cn(
                  "size-4",
                  item.isFavorite && "fill-red-500 text-red-500",
                )}
              />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
              <RefreshCw className="size-4" />
            </span>
            <span className="flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm">
              <MoreHorizontal className="size-4" />
            </span>
          </div>
          <div className="absolute bottom-0 inset-x-0 px-3 py-2">
            <p className="truncate text-xs text-white/90">{item.prompt}</p>
          </div>
        </div>
      </div>
    </button>
  );
}
