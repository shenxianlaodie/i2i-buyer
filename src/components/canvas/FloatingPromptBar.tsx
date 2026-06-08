"use client";

import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Plus, ArrowRight, ImageIcon, Film, X, Loader2, Download } from "lucide-react";
import { downloadImage } from "@/lib/download-helper";
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
// Sora-2 视频尺寸（via 兔子中转）
const VIDEO_SIZES = ["1280x720", "720x1280", "1792x1024", "1024x1792"] as const;
// Sora-2 支持的视频时长（秒）
const VIDEO_DURATIONS = ["4", "8", "10", "12", "15", "25"] as const;

export function FloatingPromptBar({
  onGenerate,
  onUpload,
  queuePosition,
  startTime,
}: {
  onGenerate: () => void;
  onUpload: () => void;
  queuePosition?: number; // -1=不在队列, 0=生成中, >0=排队位置
  startTime?: number;
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
  const generationStartTime = useCanvasStore((s) => s.generationStartTime);
  const videoDuration = useCanvasStore((s) => s.videoDuration);
  const setVideoDuration = useCanvasStore((s) => s.setVideoDuration);
  const videoSize = useCanvasStore((s) => s.videoSize);
  const setVideoSize = useCanvasStore((s) => s.setVideoSize);

  const selected = items.find((i) => i.id === selectedId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 切到 i2v 时，如果当前尺寸不在 Sora-2 支持列表中，默认使用 1280x720
  useEffect(() => {
    if (mode === "i2v" && !VIDEO_SIZES.includes(videoSize as typeof VIDEO_SIZES[number])) {
      setVideoSize("1280x720");
    }
  }, [mode]); /* eslint-disable-line react-hooks/exhaustive-deps */
  // 每次渲染用 Date.now() - startTime 计算，切换页面不重置
  const [displayElapsed, setDisplayElapsed] = useState(0);
  useEffect(() => {
    if (!isGenerating) {
      setDisplayElapsed(0);
      return;
    }
    // 优先使用 store 中跨页面持久化的 generationStartTime
    const anchor = generationStartTime ?? startTime ?? Date.now();
    const tick = () => setDisplayElapsed(Math.max(0, Math.floor((Date.now() - anchor) / 1000)));
    tick(); // 立即更新一次
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [isGenerating, startTime, generationStartTime]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex justify-center px-4 lg:bottom-20">
      <div className="pointer-events-auto flex w-full max-w-5xl flex-col gap-2 rounded-2xl border border-white/10 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-xl">
        {/* 生成中进度条 + 排队状态 */}
        {isGenerating && (
          <div className="flex items-center gap-2 px-1">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full animate-progress-indeterminate rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" style={{ width: "40%" }} />
            </div>
            <span className="text-xs text-zinc-400 tabular-nums shrink-0">
              <Loader2 className="mr-1 inline size-3 animate-spin" />
              {queuePosition !== undefined && queuePosition > 0
                ? `排队 ${queuePosition}/${(queuePosition ?? 0) + 2}`
                : `${displayElapsed}s`}
            </span>
          </div>
        )}
        {selected && (
          <div className="flex items-center gap-2 rounded-lg bg-zinc-800/80 px-2 py-1.5">
            <img
              src={selected.thumbnailUrl || selected.url}
              alt=""
              className="size-10 rounded-md object-cover"
            />
            <span className="flex-1 truncate text-xs text-zinc-400">
              参考图 · {mode === "i2i" ? "图生图" : "图生视频"}
            </span>
            {selected.originalUrl && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadImage(selected.originalUrl!);
                }}
                className="text-zinc-500 hover:text-zinc-300"
                title="下载原图"
              >
                <Download className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => select(null)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-3">
          <button
            type="button"
            onClick={onUpload}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white"
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
            rows={2}
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
            className="max-h-36 min-h-[56px] flex-1 resize-y rounded-lg bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder:text-zinc-500 outline-none focus:bg-zinc-800"
          />
          {/* i2v: 尺寸选择器；i2i: 比例选择器 */}
          {mode === "i2v" ? (
            <div className="flex shrink-0 flex-col gap-1">
              <span className="text-[9px] text-zinc-500 pl-1">尺寸</span>
              <Select value={videoSize} onValueChange={(v) => v && setVideoSize(v)}>
                <SelectTrigger className="h-9 w-[96px] border-white/10 bg-zinc-800 text-xs text-zinc-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIDEO_SIZES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex shrink-0 flex-col gap-1">
              <span className="text-[9px] text-zinc-500 pl-1">比例</span>
              <Select
                value={aspectRatio}
                onValueChange={(v) => v && setAspectRatio(v as AspectRatio)}
              >
                <SelectTrigger className="h-9 w-[72px] border-white/10 bg-zinc-800 text-xs text-zinc-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATIOS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {mode === "i2v" && (
            <div className="flex shrink-0 flex-col gap-1">
              <span className="text-[9px] text-zinc-500 pl-1">时长</span>
              <Select value={videoDuration} onValueChange={(v) => v && setVideoDuration(v)}>
                <SelectTrigger className="h-9 w-[64px] border-white/10 bg-zinc-800 text-xs text-zinc-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIDEO_DURATIONS.map((d) => (
                    <SelectItem key={d} value={d}>{d}s</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <button
            type="button"
            disabled={isGenerating || (!prompt.trim() && !selected)}
            onClick={onGenerate}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-zinc-900 transition-opacity hover:bg-zinc-200 disabled:opacity-40"
          >
            {isGenerating ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ArrowRight className="size-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
