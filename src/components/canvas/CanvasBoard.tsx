"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Search, SlidersHorizontal, Plus, HelpCircle, Settings, MoreHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import { useCanvasStore, type CanvasMedia } from "@/store/canvas-store";
import { useActiveTasks } from "@/hooks/use-active-tasks";
import { CanvasSidebar } from "./CanvasSidebar";
import { MediaGrid } from "./MediaGrid";
import { FloatingPromptBar } from "./FloatingPromptBar";
import { useAdminModels } from "@/hooks/use-admin-models";
import { GENERATION_SOURCE_CANVAS } from "@/lib/generation-source";
import { ImagePreviewModal } from "@/components/ui/image-preview-modal";
import { compressImageForPreview } from "@/lib/image-compression";

/** 将 blob URL 上传到临时存储（不上传 OSS），返回服务端可访问的完整 URL */
async function uploadBlobToTemp(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  const fd = new FormData();
  fd.append("file", blob, "reference.png");
  const uploadRes = await fetch("/api/temp-upload", { method: "POST", body: fd });
  const data = (await uploadRes.json()) as { url?: string; error?: string };
  if (!uploadRes.ok) throw new Error(data.error ?? "上传失败");
  return data.url!;
}

export function CanvasBoard() {
  const trpc = useTRPC();
  const fileRef = useRef<HTMLInputElement>(null);
  // 从 store 读取全部状态（含跨页面持久化的生成追踪字段）
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
    updateItem,
    removeItem,
    setItems,
    select,
    pendingGenId,
    generationStartTime,
    setPendingGeneration,
    clearPendingGeneration,
    videoDuration,
    videoSize,
  } = useCanvasStore();
  const { imageModelId, videoModelId } = useAdminModels();

  const selected = items.find((i) => i.id === selectedId);

  const [previewItem, setPreviewItem] = useState<CanvasMedia | null>(null);

  // ========== 素材无限滚动加载 ==========
  const PAGE_SIZE = 24;
  // 记录用户主动关闭的生成占位（id 以 gen- 开头），防止生成完成后服务端素材再次出现
  const dismissedGenIdsRef = useRef<Set<string>>(new Set());

  const {
    data: assetData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isAssetLoading,
    isError: isAssetError,
    error: assetError,
  } = useInfiniteQuery(
    trpc.assets.listAll.infiniteQueryOptions(
      { limit: PAGE_SIZE },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        refetchInterval: (q) => {
          // 优先检查缓存数据中的生成中项
          const hasGeneratingInCache = q.state.data?.pages?.some((p: any) =>
            p.items?.some((i: any) => i.generationStatus === "QUEUED" || i.generationStatus === "GENERATING"),
          );
          // 同时检查 Zustand store 中的本地占位（新发起的生成缓存里可能还没有）
          const hasLocalQueue = useCanvasStore.getState().items.some(
            (it) => it.generationStatus === "QUEUED" || it.generationStatus === "GENERATING",
          );
          return (hasGeneratingInCache || hasLocalQueue) ? 3000 : false;
        },
      },
    ),
  );

  // 每次服务端数据变化时，合并服务端素材与本地占位
  useEffect(() => {
    if (!assetData?.pages) return;

    const allAssetItems: CanvasMedia[] = assetData.pages.flatMap((page) =>
      page.items.map((asset) => ({
        id: `asset-${asset.id}`,
        type: asset.type as "IMAGE" | "VIDEO",
        url: asset.cdnUrl || asset.urlPreview || asset.originalUrl,
        thumbnailUrl: asset.urlThumb ?? asset.thumbnailUrl ?? undefined,
        originalUrl: asset.originalUrl,
        prompt: asset.generation?.prompt ?? "",
        category: asset.type === "VIDEO" ? "video" : "image",
        createdAt: asset.createdAt.toISOString(),
        generationId: asset.generationId ?? undefined,
        generationStatus:
          (asset.generationStatus as "QUEUED" | "GENERATING" | "FAILED" | null) ?? null,
        // 从 updatedAt 推算失败时间（若为 FAILED 状态）
        failedAt:
          (asset.generationStatus as string) === "FAILED"
            ? new Date((asset as any).updatedAt ?? asset.createdAt).getTime()
            : undefined,
        userName: asset.user?.name ?? undefined,
      })),
    );

    // 保留本地上传或生成占位（id 以 upload- 或 gen- 开头）并放在最前面
    const localPlaceholders = items.filter((it) => it.id.startsWith("upload-") || it.id.startsWith("gen-"));
    const localIds = new Set(localPlaceholders.map((i) => i.id));
    const localGenIds = new Set(
      localPlaceholders.map((i) => i.generationId).filter(Boolean),
    );

    // 过滤掉与本地占位重复的服务端素材，同时过滤被用户主动关闭的
    const dismissedIds = dismissedGenIdsRef.current;
    const filteredServerAssets = allAssetItems.filter(
      (a) =>
        !localIds.has(a.id) &&
        !(a.generationId && localGenIds.has(a.generationId)) &&
        !(a.generationId && dismissedIds.has(a.generationId)),
    );

    setItems([...localPlaceholders, ...filteredServerAssets]);
  }, [assetData?.pages]);

  // ========== 滚动触底自动加载下一页 ==========
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!hasNextPage || isFetchingNextPage) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < 400) {
        fetchNextPage();
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ========== 生成状态轮询（store 持久化，跨页面不丢失） ==========
  const pendingStartRef = useRef<number | null>(null);

  const genStatusQuery = useQuery({
    ...trpc.generation.getStatus.queryOptions({ generationId: pendingGenId! }),
    enabled: !!pendingGenId,
    refetchInterval: () => {
      if (!pendingStartRef.current) return 2000;
      const elapsed = Date.now() - pendingStartRef.current;
      if (elapsed < 10_000) return 1000;
      if (elapsed < 30_000) return 2000;
      if (elapsed < 70_000) return 4000;
      if (elapsed < 150_000) return 8000;
      return 10_000;
    },
  });

  useEffect(() => {
    if (pendingGenId) {
      if (generationStartTime) {
        pendingStartRef.current = generationStartTime;
      } else {
        pendingStartRef.current = Date.now();
      }
    } else {
      pendingStartRef.current = null;
    }
  }, [pendingGenId, generationStartTime]);

  // 全局活跃任务轮询 + 跨页面恢复
  const activeTasksQuery = useActiveTasks();

  useEffect(() => {
    if (!activeTasksQuery.data || pendingGenId) return;
    const activeCanvasTask = activeTasksQuery.data.find(
      (t) =>
        (t.status === "PENDING" || t.status === "QUEUED" || t.status === "PROCESSING") &&
        !t.fusionRowId &&
        !t.poseRowId &&
        !t.fusionBatchId &&
        !t.poseBatchId,
    );
    if (!activeCanvasTask) return;

    const startTime = activeCanvasTask.startedAt
      ? new Date(activeCanvasTask.startedAt).getTime()
      : activeCanvasTask.createdAt
        ? new Date(activeCanvasTask.createdAt).getTime()
        : Date.now();

    setPendingGeneration({
      genId: activeCanvasTask.id,
      mode: activeCanvasTask.type === "VIDEO" ? "i2v" : "i2i",
      prompt: activeCanvasTask.prompt ?? "",
      startTime,
    });
  }, [activeTasksQuery.data, pendingGenId, setPendingGeneration]);

  const queueStatsQuery = useQuery({
    ...trpc.generation.getQueueStats.queryOptions({
      generationId: pendingGenId ?? undefined,
      type: mode === "i2v" ? "VIDEO" : "IMAGE",
    }),
    enabled: !!pendingGenId,
    refetchInterval: 2000,
  });

  // 处理生成完成/失败
  useEffect(() => {
    if (!genStatusQuery.data) return;
    const gen = genStatusQuery.data;
    const placeholderId = `gen-${gen.id}`;
    const storeState = useCanvasStore.getState();
    // 如果用户已主动关闭此占位，不再处理
    if (dismissedGenIdsRef.current.has(gen.id) && !storeState.items.some((it) => it.id === placeholderId)) {
      return;
    }

    if (gen.status === "PROCESSING" && storeState.items.some((it) => it.id === placeholderId && it.generationStatus === "QUEUED")) {
      // 生成已开始处理，占位从 QUEUED 切换为 GENERATING（显示旋转动画 + "生成中"）
      updateItem(placeholderId, { generationStatus: "GENERATING" });
    } else if (gen.status === "COMPLETED") {
      const outUrl = gen.outputUrls?.[0] ??
        (storeState.pendingGenMode === "i2v" ? selected?.url : `https://picsum.photos/seed/${Date.now()}/480/640`);
      updateItem(placeholderId, {
        type: gen.type as "IMAGE" | "VIDEO",
        url: outUrl ?? "",
        prompt: storeState.pendingGenPrompt,
        category: storeState.pendingGenMode === "i2v" ? "video" : "image",
        createdAt: new Date().toISOString(),
        generationId: gen.id,
        generationStatus: null,
      });

      const timing = (gen.outputData as Record<string, unknown>)?._timing as
        | { genDurationMs?: number; ossDurationMs?: number; totalDurationMs?: number }
        | undefined;
      let timeMsg = storeState.pendingGenMode === "i2v" ? "图生视频完成" : "图生图完成";
      if (timing?.genDurationMs) {
        const genSec = (timing.genDurationMs / 1000).toFixed(0);
        const ossSec = timing.ossDurationMs ? (timing.ossDurationMs / 1000).toFixed(0) : "?";
        timeMsg += ` · AI ${genSec}s + 转存 ${ossSec}s`;
      }
      toast.success(timeMsg);
      clearPendingGeneration();
      useCanvasStore.getState().setPrompt("");
    } else if (gen.status === "FAILED") {
      toast.error(gen.errorMessage ?? "生成失败");
      removeItem(placeholderId);
      clearPendingGeneration();
    }
  }, [genStatusQuery.data, removeItem, updateItem, clearPendingGeneration, selected?.url]);

  // ========== Mutations ==========
  const createImage = useMutation(
    trpc.generation.createImage.mutationOptions({
      onError: (e) => { toast.error(e.message); setGenerating(false); clearPendingGeneration(); },
    }),
  );
  const createVideo = useMutation(
    trpc.generation.createVideo.mutationOptions({
      onError: (e) => { toast.error(e.message); setGenerating(false); clearPendingGeneration(); },
    }),
  );

  const moveToTrash = useMutation(
    trpc.assets.moveToTrash.mutationOptions({
      onSuccess: () => {
        toast.success("已移至回收站");
      },
      onError: (e) => toast.error(e.message ?? "删除失败"),
    }),
  );

  const handleDelete = useCallback((item: CanvasMedia) => {
    // 生成中/失败的占位：不放入回收站，直接移除，记录已关闭防止完成后再出现
    if (item.id.startsWith("gen-") && item.generationStatus) {
      if (item.generationId) {
        dismissedGenIdsRef.current.add(item.generationId);
      }
      removeItem(item.id);
      // 如果正在关闭的是当前活跃的生成任务，同时清空生成状态
      if (item.generationId === pendingGenId) {
        clearPendingGeneration();
      }
      return;
    }
    // 正常素材：移至回收站
    const assetId = item.id.startsWith("asset-") ? item.id.slice(6) : item.id;
    moveToTrash.mutate({ assetIds: [assetId] });
    // 画板本地移除（moveToTrash 已处理 Asset + TrashedCanvasItem）
    removeItem(item.id);
  }, [moveToTrash, removeItem, pendingGenId, clearPendingGeneration]);

  // 失败卡片"重试"：召回 prompt + 参考图，选择参考图，聚焦提示词输入
  const handleRetry = useCallback((item: CanvasMedia) => {
    const { setPrompt, setMode, select } = useCanvasStore.getState();
    // 召回 prompt
    setPrompt(item.prompt);
    // 图生图/视频：如果有原始 URL，选为参考图
    if (item.originalUrl) {
      // 如果参考图 item 不在当前 store 中，添加为本地占位
      const refId = item.id.startsWith("asset-") ? item.id : `upload-retry-${Date.now()}`;
      const existing = useCanvasStore.getState().items.find((i) => i.id === refId);
      if (!existing) {
        useCanvasStore.getState().addItem({
          id: refId,
          type: "IMAGE",
          url: item.originalUrl,
          originalUrl: item.originalUrl,
          prompt: item.prompt,
          category: "image",
          createdAt: new Date().toISOString(),
        });
      }
      select(refId);
      setMode("i2i");
    }
    // 删除失败占位
    removeItem(item.id);
    // 同时也清理 DB 中的失败占位（不占用存储空间）
    if (item.id.startsWith("asset-")) {
      const assetId = item.id.slice(6);
      moveToTrash.mutate({ assetIds: [assetId] });
    }
  }, [removeItem, moveToTrash]);

  const handleUpload = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      const id = `upload-${Date.now()}`;
      addItem({
        id,
        type: "VIDEO",
        url,
        prompt: file.name,
        category: "video",
        createdAt: new Date().toISOString(),
      });
      select(id);
      e.target.value = "";
      return;
    }

    try {
      const { url } = await compressImageForPreview(file, 1200);
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
    } catch {
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
    }
    e.target.value = "";
  };

  // ========== 生成按钮 ==========
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

    const genStartTime = Date.now();
    setGenerating(true);
    try {
      // 本地 blob URL 先上传到临时存储（不上传 OSS），确保服务端可访问参考图
      let refUrl = selected?.url ?? "";
      if (refUrl.startsWith("blob:")) {
        refUrl = await uploadBlobToTemp(refUrl);
      }

      if (mode === "i2i") {
        const result = await createImage.mutateAsync({
          prompt: prompt.trim() || "基于参考图生成变体",
          modelId,
          provider: "ephone",
          aspectRatio,
          referenceImageUrl: refUrl || undefined,
        });

        const placeholderId = `gen-${result.generationId}`;
        const existing = items.find(
          (it) => it.generationId === result.generationId || it.id === placeholderId,
        );
        if (!existing) {
          addItem({
            id: placeholderId,
            type: "IMAGE",
            url: selected?.thumbnailUrl || selected?.url || "",
            prompt: prompt.trim() || "图生图占位",
            category: "image",
            createdAt: new Date().toISOString(),
            generationId: result.generationId,
            generationStatus: "QUEUED",
          });
          select(placeholderId);
        }

        setPendingGeneration({
          genId: result.generationId,
          mode: "i2i",
          prompt: prompt.trim() || "图生图结果",
          startTime: genStartTime,
        });
        toast.info("正在生成中，请稍候...", { duration: 3000 });
      } else {
        // 图生视频：统一走兔子 (tuzi) 中转 → Sora-2
        const result = await createVideo.mutateAsync({
          prompt: prompt.trim() || "基于参考图生成视频",
          modelId,
          provider: "tuzi",
          aspectRatio,
          duration: parseInt(videoDuration, 10),
          videoSize,
          referenceImageUrl: refUrl || undefined,
          source: GENERATION_SOURCE_CANVAS,
        });

        const placeholderId = `gen-${result.generationId}`;
        const existing = items.find(
          (it) => it.generationId === result.generationId || it.id === placeholderId,
        );
        if (!existing) {
          addItem({
            id: placeholderId,
            type: "VIDEO",
            url: selected?.thumbnailUrl || selected?.url || "",
            prompt: prompt.trim() || "图生视频占位",
            category: "video",
            createdAt: new Date().toISOString(),
            generationId: result.generationId,
            generationStatus: "QUEUED",
          });
          select(placeholderId);
        }

        setPendingGeneration({
          genId: result.generationId,
          mode: "i2v",
          prompt: prompt.trim() || "图生视频结果",
          startTime: genStartTime,
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
      setGenerating(false);
      clearPendingGeneration();
    }
  };

  // 计时起点：优先使用 store 持久化的 generationStartTime
  const startTime: number | undefined =
    generationStartTime ??
    (genStatusQuery.data?.startedAt
      ? new Date(genStatusQuery.data.startedAt).getTime()
      : genStatusQuery.data?.createdAt
        ? new Date(genStatusQuery.data.createdAt).getTime()
        : undefined);

  const now = format(new Date(), "M月dd日 HH:mm", { locale: zhCN });

  return (
    <div className="relative flex h-[calc(100svh-3.5rem)] flex-col bg-zinc-950 text-white md:h-[calc(100svh-3.5rem)] lg:h-full">
      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,video/*"
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
        <div
          ref={scrollContainerRef}
          className="relative min-h-0 flex-1 overflow-auto pb-32"
        >
          {isAssetLoading && items.length === 0 && (
            <p className="px-4 py-20 text-center text-sm text-zinc-500">加载中...</p>
          )}
          {isAssetError && items.length === 0 && (
            <p className="px-4 py-20 text-center text-sm text-red-400">
              加载失败：{assetError.message}
            </p>
          )}
          {(items.length > 0 || (!isAssetLoading && !isAssetError)) && (
            <>
              <MediaGrid onDelete={handleDelete} onPreview={setPreviewItem} onRetry={handleRetry} />
              {isFetchingNextPage && (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-500">
                  <Loader2 className="size-4 animate-spin" />
                  加载更多素材...
                </div>
              )}
              {!hasNextPage && items.length >= PAGE_SIZE && (
                <p className="py-6 text-center text-xs text-zinc-600">
                  已加载全部素材
                </p>
              )}
            </>
          )}
          <FloatingPromptBar
            onGenerate={handleGenerate}
            onUpload={handleUpload}
            queuePosition={queueStatsQuery.data?.position}
            startTime={startTime}
          />
        </div>
      </div>

      <ImagePreviewModal
        open={!!previewItem}
        onClose={() => setPreviewItem(null)}
        src={previewItem?.url ?? ""}
        downloadUrl={previewItem?.originalUrl}
        alt={previewItem?.prompt ?? ""}
        prompt={previewItem?.prompt ?? ""}
      />
    </div>
  );
}
