"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Search, SlidersHorizontal, Plus, HelpCircle, Settings, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import { useCanvasStore, type CanvasMedia } from "@/store/canvas-store";
import { CanvasSidebar } from "./CanvasSidebar";
import { MediaGrid } from "./MediaGrid";
import { FloatingPromptBar } from "./FloatingPromptBar";
import { useAdminModels } from "@/hooks/use-admin-models";
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
    removeItem,
    setItems,
    select,
  } = useCanvasStore();
  const { imageModelId, videoModelId } = useAdminModels();

  const selected = items.find((i) => i.id === selectedId);

  const [pendingGenId, setPendingGenId] = useState<string | null>(null);
  const [pendingGenMode, setPendingGenMode] = useState<"i2i" | "i2v">("i2i");
  const [pendingGenPrompt, setPendingGenPrompt] = useState("");

  const { data: isAdmin } = useQuery(trpc.admin.isAdmin.queryOptions());

  const ownGenQuery = useQuery({
    ...trpc.generation.listRecent.queryOptions({ status: "COMPLETED", limit: 50 }),
    enabled: isAdmin !== undefined && !isAdmin.isAdmin,
  });
  const allGenQuery = useQuery({
    ...trpc.generation.listAll.queryOptions({ status: "COMPLETED", limit: 50 }),
    enabled: isAdmin?.isAdmin === true,
  });
  const genListQuery = isAdmin?.isAdmin ? allGenQuery : ownGenQuery;

  useEffect(() => {
    if (!genListQuery.data) return;
    const canvasItems: CanvasMedia[] = genListQuery.data.items.map((gen) => ({
      id: `gen-${gen.id}`,
      type: gen.type as "IMAGE" | "VIDEO",
      url: gen.outputUrls?.[0] ?? "",
      prompt: gen.prompt,
      category: gen.type === "VIDEO" ? "video" : "image",
      createdAt: gen.createdAt.toISOString(),
      generationId: gen.id,
    }));
    setItems(canvasItems);
  }, [genListQuery.data]);

  const genStatusQuery = useQuery({
    ...trpc.generation.getStatus.queryOptions({ generationId: pendingGenId! }),
    enabled: !!pendingGenId,
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (!genStatusQuery.data) return;
    const gen = genStatusQuery.data;
    if (gen.status === "COMPLETED") {
      const outUrl = gen.outputUrls?.[0] ??
        (pendingGenMode === "i2v" ? selected?.url : `https://picsum.photos/seed/${Date.now()}/480/640`);
      addItem({
        id: `gen-${gen.id}`,
        type: gen.type as "IMAGE" | "VIDEO",
        url: outUrl ?? "",
        prompt: pendingGenPrompt,
        category: pendingGenMode === "i2v" ? "video" : "image",
        createdAt: new Date().toISOString(),
        generationId: gen.id,
      });
      toast.success(pendingGenMode === "i2v" ? "图生视频完成" : "图生图完成");
      setPendingGenId(null);
      setGenerating(false);
      useCanvasStore.getState().setPrompt("");
    } else if (gen.status === "FAILED") {
      toast.error(gen.errorMessage ?? "生成失败");
      setPendingGenId(null);
      setGenerating(false);
    }
  }, [genStatusQuery.data]);

  const createImage = useMutation(
    trpc.generation.createImage.mutationOptions({
      onError: (e) => { toast.error(e.message); setGenerating(false); },
    }),
  );
  const createVideo = useMutation(
    trpc.generation.createVideo.mutationOptions({
      onError: (e) => { toast.error(e.message); setGenerating(false); },
    }),
  );

  const trashItem = useMutation(
    trpc.canvas.trashItem.mutationOptions({
      onSuccess: (_data, variables) => {
        removeItem(variables.itemId);
        toast.success("已移至回收站");
      },
      onError: (e) => toast.error(e.message ?? "删除失败"),
    }),
  );

  const handleDelete = useCallback((item: CanvasMedia) => {
    trashItem.mutate({
      itemId: item.id,
      type: item.type,
      url: item.url,
      prompt: item.prompt,
      category: item.category,
      originalCreatedAt: item.createdAt,
    });
  }, [trashItem]);

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
        const result = await createImage.mutateAsync({
          prompt: prompt.trim() || "基于参考图生成变体",
          modelId,
          provider: "ephone",
          aspectRatio,
          referenceImageUrl: selected?.url,
        });
        setPendingGenId(result.generationId);
        setPendingGenMode("i2i");
        setPendingGenPrompt(prompt.trim() || "图生图结果");
      } else {
        const result = await createVideo.mutateAsync({
          prompt: prompt.trim() || "基于参考图生成视频",
          modelId,
          provider: "ephone",
          aspectRatio,
          referenceImageUrl: selected!.url,
          source: GENERATION_SOURCE_CANVAS,
        });
        setPendingGenId(result.generationId);
        setPendingGenMode("i2v");
        setPendingGenPrompt(prompt.trim() || "图生视频结果");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
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
          <MediaGrid onDelete={handleDelete} />
          <FloatingPromptBar onGenerate={handleGenerate} onUpload={handleUpload} />
        </div>
      </div>
    </div>
  );
}
