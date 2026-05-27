"use client";

import { useRef, useCallback } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Search, SlidersHorizontal, Plus, HelpCircle, Settings, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import { useCanvasStore } from "@/store/canvas-store";
import { CanvasSidebar } from "./CanvasSidebar";
import { MediaGrid } from "./MediaGrid";
import { FloatingPromptBar } from "./FloatingPromptBar";
import { ModelSelect } from "@/components/model/ModelSelect";
import { useModelStore } from "@/store/model-store";
import { GENERATION_SOURCE_CANVAS } from "@/lib/generation-source";

export function CanvasBoard() {
  const trpc = useTRPC();
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    prompt,
    mode,
    aspectRatio,
    selectedId,
    items,
    search,
    setSearch,
    setGenerating,
    addItem,
    select,
  } = useCanvasStore();
  const imageModelId = useModelStore((s) => s.imageModelId);
  const videoModelId = useModelStore((s) => s.videoModelId);

  const selected = items.find((i) => i.id === selectedId);

  const createImage = useMutation(
    trpc.generation.createImage.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );
  const createVideo = useMutation(
    trpc.generation.createVideo.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );

  const handleUpload = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const id = `upload-${Date.now()}`;
    addItem({
      id,
      type: "IMAGE",
      url,
      prompt: file.name,
      category: "image",
      createdAt: new Date().toISOString(),
    });
    select(id);
    e.target.value = "";
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && !selected) {
      toast.error("请输入提示词或选择参考图");
      return;
    }
    if (mode === "i2v" && !selected) {
      toast.error("图生视频需要先选择一张图片");
      return;
    }

    const modelId = mode === "i2i" ? imageModelId : videoModelId;
    if (!modelId) {
      toast.error("请先选择模型");
      return;
    }

    setGenerating(true);
    try {
      if (mode === "i2i") {
        const imgResult = await createImage.mutateAsync({
          prompt: prompt.trim() || "基于参考图生成变体",
          modelId,
          provider: "ephone",
          aspectRatio,
          referenceImageUrl: selected?.url,
        });
        const outUrl =
          imgResult.outputUrls?.[0] ??
          `https://picsum.photos/seed/${Date.now()}/480/640`;
        addItem({
          id: `gen-${Date.now()}`,
          type: "IMAGE",
          url: outUrl,
          prompt: prompt.trim() || "图生图结果",
          category: "image",
          createdAt: new Date().toISOString(),
        });
        toast.success("图生图完成");
      } else {
        const vidResult = await createVideo.mutateAsync({
          prompt: prompt.trim() || "基于参考图生成视频",
          modelId,
          provider: "ephone",
          aspectRatio,
          referenceImageUrl: selected!.url,
          source: GENERATION_SOURCE_CANVAS,
        });
        const outUrl =
          vidResult.outputUrls?.[0] ?? selected!.url;
        addItem({
          id: `gen-${Date.now()}`,
          type: "VIDEO",
          url: outUrl,
          prompt: prompt.trim() || "图生视频结果",
          category: "video",
          createdAt: new Date().toISOString(),
        });
        toast.success("图生视频完成");
      }
      useCanvasStore.getState().setPrompt("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const now = format(new Date(), "M月dd日 HH:mm", { locale: zhCN });

  return (
    <div className="relative flex h-[calc(100svh-3.5rem)] flex-col bg-zinc-950 text-white md:h-[calc(100svh-3.5rem)] lg:h-full">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={onFileChange}
      />

      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <span className="hidden text-sm text-zinc-500 sm:block">{now}</span>
        <div className="relative mx-auto flex max-w-xl flex-1 items-center">
          <Search className="absolute left-3 size-4 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索媒体..."
            className="h-9 w-full rounded-full border border-white/10 bg-zinc-900 pl-9 pr-10 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-white/20"
          />
          <SlidersHorizontal className="absolute right-3 size-4 text-zinc-500" />
        </div>
        <div className="flex items-center gap-2 text-zinc-400">
          <ModelSelect type="image" label="图" className="[&_span]:text-zinc-500" />
          <ModelSelect type="video" label="视频" className="[&_span]:text-zinc-500" />
          <button type="button" onClick={handleUpload} className="rounded-full p-2 hover:bg-zinc-800 hover:text-white">
            <Plus className="size-4" />
          </button>
          <button type="button" className="rounded-full p-2 hover:bg-zinc-800 hover:text-white">
            <HelpCircle className="size-4" />
          </button>
          <button type="button" className="rounded-full p-2 hover:bg-zinc-800 hover:text-white">
            <Settings className="size-4" />
          </button>
          <button type="button" className="rounded-full p-2 hover:bg-zinc-800 hover:text-white">
            <MoreHorizontal className="size-4" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <CanvasSidebar />
        <div className="relative min-h-0 flex-1 overflow-auto pb-32">
          <MediaGrid />
          <FloatingPromptBar onGenerate={handleGenerate} onUpload={handleUpload} />
        </div>
      </div>
    </div>
  );
}
