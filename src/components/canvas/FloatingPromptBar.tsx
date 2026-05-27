"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Plus, ArrowRight, ImageIcon, Film, X } from "lucide-react";
import { useCanvasStore } from "@/store/canvas-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AspectRatio } from "@/server/ai-gateway/types";

const RATIOS: AspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4"];

export function FloatingPromptBar({
  onGenerate,
  onUpload,
}: {
  onGenerate: () => void;
  onUpload: () => void;
}) {
  const prompt = useCanvasStore((s) => s.prompt);
  const setPrompt = useCanvasStore((s) => s.setPrompt);
  const mode = useCanvasStore((s) => s.mode);
  const setMode = useCanvasStore((s) => s.setMode);
  const aspectRatio = useCanvasStore((s) => s.aspectRatio);
  const setAspectRatio = useCanvasStore((s) => s.setAspectRatio);
  const selectedId = useCanvasStore((s) => s.selectedId);
  const items = useCanvasStore((s) => s.items);
  const select = useCanvasStore((s) => s.select);
  const isGenerating = useCanvasStore((s) => s.isGenerating);

  const selected = items.find((i) => i.id === selectedId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex justify-center px-4 lg:bottom-20">
      <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-2 rounded-2xl border border-white/10 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur-xl">
        {selected && (
          <div className="flex items-center gap-2 rounded-lg bg-zinc-800/80 px-2 py-1.5">
            <img
              src={selected.url}
              alt=""
              className="size-10 rounded-md object-cover"
            />
            <span className="flex-1 truncate text-xs text-zinc-400">
              参考图 · {mode === "i2i" ? "图生图" : "图生视频"}
            </span>
            <button
              type="button"
              onClick={() => select(null)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={onUpload}
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <Plus className="size-5" />
          </button>
          <div className="flex shrink-0 gap-1 rounded-full bg-zinc-800 p-0.5">
            <button
              type="button"
              onClick={() => setMode("i2i")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "i2i"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <ImageIcon className="size-3.5" />
              图生图
            </button>
            <button
              type="button"
              onClick={() => setMode("i2v")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                mode === "i2v"
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <Film className="size-3.5" />
              图生视频
            </button>
          </div>
          <textarea
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onGenerate();
              }
            }}
            placeholder={
              selected
                ? "描述你希望如何变换这张图片..."
                : "先选择一张图片，或输入提示词创作"
            }
            className="max-h-24 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-sm text-white placeholder:text-zinc-500 outline-none"
          />
          <Select
            value={aspectRatio}
            onValueChange={(v) => v && setAspectRatio(v as AspectRatio)}
          >
            <SelectTrigger className="h-9 w-[72px] shrink-0 border-white/10 bg-zinc-800 text-xs text-zinc-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RATIOS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={isGenerating || (!prompt.trim() && !selected)}
            onClick={onGenerate}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 transition-opacity hover:bg-zinc-200 disabled:opacity-40"
          >
            <ArrowRight className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
