"use client";

import { useMemo } from "react";
import { useCanvasStore } from "@/store/canvas-store";
import { MediaCard } from "./MediaCard";

export function MediaGrid() {
  const items = useCanvasStore((s) => s.items);
  const filter = useCanvasStore((s) => s.filter);
  const search = useCanvasStore((s) => s.search);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filter === "image" && it.type !== "IMAGE") return false;
      if (filter === "video" && it.type !== "VIDEO") return false;
      if (search && !it.prompt.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [items, filter, search]);

  return (
    <div className="columns-2 gap-3 p-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
      {filtered.map((item) => (
        <div key={item.id} className="mb-3 break-inside-avoid">
          <MediaCard item={item} />
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
