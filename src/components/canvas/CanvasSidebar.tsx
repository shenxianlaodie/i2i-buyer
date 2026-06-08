"use client";

import { cn } from "@/lib/utils";
import {
  Images,
  ImageIcon,
  Film,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useCanvasStore, type CanvasFilter } from "@/store/canvas-store";

const NAV: { id: CanvasFilter; label: string; icon: typeof Images }[] = [
  { id: "all", label: "所有媒体内容", icon: Images },
  { id: "image", label: "图片", icon: ImageIcon },
  { id: "video", label: "视频", icon: Film },
];

export function CanvasSidebar() {
  const filter = useCanvasStore((s) => s.filter);
  const setFilter = useCanvasStore((s) => s.setFilter);
  const collapsed = useCanvasStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useCanvasStore((s) => s.setSidebarCollapsed);

  return (
    <aside
      className={cn(
        "hidden md:flex shrink-0 flex-col border-r border-white/10 bg-zinc-950 text-zinc-300 transition-[width] duration-200",
        collapsed ? "w-14" : "w-52",
      )}
    >
      <div className="p-2 space-y-0.5 border-t border-white/10">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            title={collapsed ? item.label : undefined}
            onClick={() => setFilter(item.id)}
            className={cn(
              "flex w-full items-center rounded-lg text-sm transition-colors",
              collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
              filter === item.id
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {!collapsed && item.label}
          </button>
        ))}
        <button
          type="button"
          title={collapsed ? "展开" : undefined}
          onClick={() => setSidebarCollapsed(!collapsed)}
          className={cn(
            "flex w-full items-center rounded-lg text-sm text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300",
            collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4 shrink-0" />
          ) : (
            <PanelLeftClose className="size-4 shrink-0" />
          )}
          {!collapsed && "收起"}
        </button>
        {!collapsed && (
          <p className="px-3 py-2 text-[10px] leading-relaxed text-zinc-600">
            AI 生成结果仅供参考，请自行核查。
          </p>
        )}
      </div>
    </aside>
  );
}
