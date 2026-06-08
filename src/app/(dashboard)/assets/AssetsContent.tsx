"use client";

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, Grid3X3, List, Image, Video, Heart, Download, Users, Loader2, Trash2, CheckSquare, X, RotateCcw } from "lucide-react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTRPC } from "@/server/trpc/client";
import { BlurhashImage } from "@/components/ui/blurhash-image";
import { ImagePreviewModal } from "@/components/ui/image-preview-modal";
import { downloadImage } from "@/lib/download-helper";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 20;

/** 生成中超过此时间（ms）视为卡住 */
const GENERATING_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟
/** 失败卡片超过此时间（ms）自动消隐 */
const FAILED_TTL_MS = 5 * 60 * 1000; // 5 分钟

function useColumns(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [columns, setColumns] = useState(3);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.clientWidth;
      if (w < 480) setColumns(2);
      else if (w < 768) setColumns(3);
      else if (w < 1024) setColumns(4);
      else setColumns(5);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef]);
  return columns;
}

export function AssetsContent() {
  const trpc = useTRPC();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "IMAGE" | "VIDEO">("all");
  const [previewAsset, setPreviewAsset] = useState<{
    id: string; type: string; originalUrl: string; filename?: string;
    urlThumb?: string | null; urlPreview?: string | null;
    blurHash?: string | null; width?: number | null; height?: number | null;
    generation?: { prompt?: string } | null;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const columns = useColumns(containerRef);

  // 管理员权限检查
  const adminQuery = useQuery(trpc.admin.isAdmin.queryOptions(undefined, { retry: false }));
  const isAdmin = adminQuery.data?.isAdmin ?? false;

  // 管理员：可筛选用户
  const [filterUserId, setFilterUserId] = useState<string>("__all__");
  // 批量选择
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const userListQuery = useQuery({
    ...trpc.admin.listUsers.queryOptions({ limit: 100 }),
    enabled: isAdmin,
    retry: false,
  });
  const users = userListQuery.data ?? [];

  // 无限查询
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useInfiniteQuery(
    trpc.assets.listAll.infiniteQueryOptions(
      {
        type: typeFilter !== "all" ? typeFilter : undefined,
        search: search || undefined,
        userId: isAdmin && filterUserId !== "__all__" ? filterUserId : undefined,
        limit: PAGE_SIZE,
      },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        staleTime: 5 * 60 * 1000,
        placeholderData: keepPreviousData,
        refetchInterval: (q) => {
          const hasGenerating = q.state.data?.pages?.some((p: any) =>
            p.items?.some((i: any) => i.generationStatus === "QUEUED" || i.generationStatus === "GENERATING"),
          );
          return hasGenerating ? 3000 : false;
        },
      },
    ),
  );

  const allItems = useMemo(
    () => {
      const raw = data?.pages.flatMap((p) => p.items) ?? [];
      const now = Date.now();
      return raw.filter((item: any) => {
        // 失败卡片 TTL 自动消隐：超过 5 分钟自动隐藏
        if (item.generationStatus === "FAILED") {
          const updatedAt = item.updatedAt ? new Date(item.updatedAt).getTime() : new Date(item.createdAt).getTime();
          if (now - updatedAt > FAILED_TTL_MS) return false;
        }
        return true;
      });
    },
    [data?.pages],
  );

  // 网格模式：将 items 分组为行
  const rows = useMemo(() => {
    if (viewMode === "list") return null;
    const result: (typeof allItems)[] = [];
    for (let i = 0; i < allItems.length; i += columns) {
      result.push(allItems.slice(i, i + columns));
    }
    return result;
  }, [allItems, columns, viewMode]);

  // 虚拟滚动（rows 或 flat items）
  const virtualItems = viewMode === "grid" && rows
    ? rows
    : allItems;

  const estimateSize = useCallback(
    () => (viewMode === "grid" ? 300 : 72),
    [viewMode],
  );

  const virtualizer = useVirtualizer({
    count: virtualItems.length + (hasNextPage ? 1 : 0),
    getScrollElement: () => containerRef.current,
    estimateSize,
    overscan: 3,
  });

  // 触底自动加载（使用滚动事件监听，更可靠）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!hasNextPage || isFetchingNextPage) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < 300) {
        fetchNextPage();
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // 收藏切换
  const toggleFavoriteMut = useMutation(
    trpc.assets.toggleFavorite.mutationOptions(),
  );

  const handleToggleFavorite = (assetId: string) => {
    toggleFavoriteMut.mutate({ assetId });
  };

  // 批量选择逻辑
  const toggleSelect = (id: string) => {
    if (!selectMode) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    setSelectedIds(new Set());
  };
  const selectAll = () => {
    if (selectedIds.size === allItems.length && allItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allItems.map((a) => a.id)));
    }
  };

  const moveToTrashMut = useMutation(
    trpc.assets.moveToTrash.mutationOptions(),
  );
  const hardDeleteFailedMut = useMutation(
    trpc.assets.hardDeleteFailed.mutationOptions({
      onSuccess: () => {
        toast.success("已删除失败记录");
        qc.invalidateQueries(trpc.assets.listAll.infiniteQueryOptions(
          { limit: PAGE_SIZE },
          { getNextPageParam: () => undefined as string | undefined },
        ));
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const handleHardDelete = useCallback((assetId: string) => {
    hardDeleteFailedMut.mutate({ assetId });
  }, [hardDeleteFailedMut]);

  // 失败卡片重试：跳转到画板并召回参数
  const handleRetry = useCallback((asset: {
    id: string;
    generationStatus?: string | null;
    generation?: { prompt?: string } | null;
    originalUrl: string;
  }) => {
    // 直接跳转到画板页面，本地 store 会处理重试逻辑
    // 先清理失败占位
    hardDeleteFailedMut.mutate({ assetId: asset.id });
    // 跳转画板（带召回参数可通过 store 或 URL 传参实现）
    toast.info("已清理失败记录，请前往画板重新生成", {
      action: { label: "去画板", onClick: () => window.location.href = "/studio" },
    });
  }, [hardDeleteFailedMut]);
  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    moveToTrashMut.mutate(
      { assetIds: [...selectedIds] },
      {
        onSuccess: (d) => {
          toast.success(`移入回收站 ${d.trashed} 张，直接删除 ${d.directDeleted} 张`);
          setSelectedIds(new Set());
          setSelectMode(false);
          qc.invalidateQueries(trpc.assets.listAll.infiniteQueryOptions(
            { limit: PAGE_SIZE },
            { getNextPageParam: () => undefined as string | undefined },
          ));
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };
  const handleBatchDownload = () => {
    const selected = allItems.filter((a) => selectedIds.has(a.id));
    for (const a of selected) {
      downloadImage(a.originalUrl, a.filename || `image-${a.id.slice(-8)}.png`);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="border-b p-4 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="搜索素材..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center border rounded-md">
          <Button
            variant={typeFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTypeFilter("all")}
          >
            全部
          </Button>
          <Button
            variant={typeFilter === "IMAGE" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTypeFilter("IMAGE")}
          >
            <Image className="size-3.5 mr-1" />
            图片
          </Button>
          <Button
            variant={typeFilter === "VIDEO" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setTypeFilter("VIDEO")}
          >
            <Video className="size-3.5 mr-1" />
            视频
          </Button>
        </div>
        {isAdmin && (
          <Select value={filterUserId} onValueChange={(v) => setFilterUserId(v ?? "__all__")}>
            <SelectTrigger className="w-40 h-9 text-xs">
              <Users className="size-3.5 mr-1" />
              <SelectValue placeholder="全部用户" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部用户</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name || u.email?.split("@")[0] || u.id.slice(-8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center border rounded-md">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("grid")}
          >
            <Grid3X3 className="size-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            <List className="size-4" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          {allItems.length} 项{selectMode && selectedIds.size > 0 ? `（已选 ${selectedIds.size}）` : ""}
        </span>
        {/* 批量操作栏 */}
        {selectMode && selectedIds.size > 0 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={handleBatchDownload}>
              <Download className="size-3.5 mr-1" />下载
            </Button>
            <Button variant="outline" size="sm" onClick={handleBatchDelete}>
              <Trash2 className="size-3.5 mr-1" />删除
            </Button>
          </div>
        )}
        <div className="flex items-center gap-1 ml-auto">
          <Button
            variant={selectMode ? "secondary" : "ghost"}
            size="sm"
            onClick={toggleSelectMode}
          >
            <CheckSquare className="size-4 mr-1" />
            {selectMode ? "取消选择" : "批量选择"}
          </Button>
          {selectMode && (
            <Button variant="ghost" size="sm" onClick={selectAll}>
              {selectedIds.size === allItems.length && allItems.length > 0 ? "取消全选" : "全选"}
            </Button>
          )}
        </div>
      </div>

      {/* 加载/错误状态 */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">加载中...</p>
        </div>
      )}
      {isError && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-destructive">
            加载失败：{error?.message ?? "未知错误"}
          </p>
        </div>
      )}
      {!isLoading && !isError && allItems.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">暂无素材</p>
        </div>
      )}

      {/* 虚拟滚动容器 */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((vItem) => {
            const isLoader = vItem.index >= virtualItems.length;
            if (isLoader) {
              return (
                <div
                  key="loader"
                  className="absolute left-0 w-full px-4"
                  style={{ top: vItem.start, height: vItem.size }}
                >
                  <p className="text-center text-sm text-muted-foreground py-8">
                    {hasNextPage ? "加载更多..." : "没有更多了"}
                  </p>
                </div>
              );
            }

            const itemOrRow = virtualItems[vItem.index];

            if (viewMode === "grid" && Array.isArray(itemOrRow)) {
              // 一行多个卡片
              const row = itemOrRow;
              return (
                <div
                  key={`row-${vItem.index}`}
                  className="absolute left-0 w-full grid gap-4 px-4"
                  style={{
                    top: vItem.start,
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  }}
                  ref={virtualizer.measureElement}
                  data-index={vItem.index}
                >
                  {row.map((asset) => (
                    <AssetGridCard
                      key={asset.id}
                      asset={asset}
                      selectMode={selectMode}
                      selected={selectedIds.has(asset.id)}
                      onToggleSelect={() => toggleSelect(asset.id)}
                      onToggleFavorite={handleToggleFavorite}
                      onPreview={() => setPreviewAsset(asset)}
                      onHardDelete={handleHardDelete}
                      onRetry={handleRetry}
                    />
                  ))}
                </div>
              );
            }

            // 列表模式（单个 item）
            const asset = itemOrRow as (typeof allItems)[number];
            if (viewMode === "list") {
              return (
                <div
                  key={asset.id}
                  className="absolute left-0 w-full px-4"
                  style={{ top: vItem.start }}
                  ref={virtualizer.measureElement}
                  data-index={vItem.index}
                >
                  <AssetListCard
                    asset={asset}
                    onToggleFavorite={handleToggleFavorite}
                    onPreview={() => setPreviewAsset(asset)}
                  />
                </div>
              );
            }

            return null;
          })}
        </div>
      </div>

      {/* 大图预览弹窗 */}
      <ImagePreviewModal
        open={!!previewAsset}
        onClose={() => setPreviewAsset(null)}
        src={previewAsset?.urlPreview || previewAsset?.urlThumb || previewAsset?.originalUrl || ""}
        downloadUrl={previewAsset?.originalUrl}
        alt={previewAsset?.generation?.prompt ?? ""}
        blurHash={previewAsset?.blurHash}
        width={previewAsset?.width}
        height={previewAsset?.height}
        prompt={previewAsset?.generation?.prompt ?? ""}
      />
    </div>
  );
}

// ── 网格卡片 ────────────────────────────

function AssetGridCard({
  asset,
  selectMode,
  selected,
  onToggleSelect,
  onToggleFavorite,
  onPreview,
  onHardDelete,
  onRetry,
}: {
  asset: {
    id: string;
    type: string;
    originalUrl: string;
    filename?: string;
    urlThumb?: string | null;
    urlPreview?: string | null;
    blurHash?: string | null;
    width?: number | null;
    height?: number | null;
    isFavorite?: boolean;
    createdAt: Date;
    updatedAt?: Date;
    generationStatus?: string | null;
    generation?: { prompt?: string } | null;
    user?: { name?: string | null } | null;
  };
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggleFavorite: (id: string) => void;
  onPreview: () => void;
  onHardDelete?: (assetId: string) => void;
  onRetry?: (asset: {
    id: string;
    generationStatus?: string | null;
    generation?: { prompt?: string } | null;
    originalUrl: string;
  }) => void;
}) {
  const thumbUrl = asset.urlThumb || asset.originalUrl;
  const prompt = asset.generation?.prompt ?? "";
  const dateStr = asset.createdAt
    ? new Date(asset.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";

  // 前端兜底：生成中超过 3 分钟 → 视为失败
  const isStuckGenerating =
    asset.generationStatus === "GENERATING" &&
    Date.now() - new Date(asset.createdAt).getTime() > GENERATING_TIMEOUT_MS;
  const effectiveStatus = isStuckGenerating ? "FAILED" : asset.generationStatus;

  const handleCardClick = () => {
    if (selectMode) { onToggleSelect(); return; }
    if (effectiveStatus === "GENERATING" || effectiveStatus === "FAILED") return;
    onPreview();
  };

  // 生成中占位卡片
  if (effectiveStatus === "GENERATING") {
    return (
      <Card className={`group overflow-hidden ${selected ? "ring-2 ring-blue-500" : ""}`} onClick={handleCardClick}>
        <div className="aspect-square bg-muted flex flex-col items-center justify-center gap-3 p-4 relative">
          {selectMode && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
              className={`absolute top-2 right-2 flex size-6 items-center justify-center rounded border-2 transition-colors z-10 ${
                selected ? "bg-blue-500 border-blue-500 text-white" : "bg-black/30 border-white/50 text-white"
              }`}
            >
              {selected && <CheckSquare className="size-3.5" />}
            </button>
          )}
          <Loader2 className="size-8 animate-spin text-blue-400" />
          <p className="text-xs text-muted-foreground text-center">生成中...</p>
        </div>
      </Card>
    );
  }

  // 失败卡片（含前端超时兜底）
  if (effectiveStatus === "FAILED") {
    return (
      <Card className={`group overflow-hidden border-red-500/20 ${selected ? "ring-2 ring-blue-500" : ""}`} onClick={handleCardClick}>
        <div className="aspect-square bg-muted flex flex-col items-center justify-center gap-2 p-4 relative">
          {selectMode && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
              className={`absolute top-2 right-2 flex size-6 items-center justify-center rounded border-2 transition-colors z-10 ${
                selected ? "bg-blue-500 border-blue-500 text-white" : "bg-black/30 border-white/50 text-white"
              }`}
            >
              {selected && <CheckSquare className="size-3.5" />}
            </button>
          )}
          {!selectMode && onHardDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onHardDelete(asset.id); }}
              className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-red-600/80 text-white hover:bg-red-500 transition-colors z-10"
              title="删除此失败记录"
            >
              <X className="size-3.5" />
            </button>
          )}
          <span className="text-2xl">⚠️</span>
          <p className="text-xs text-muted-foreground text-center">
            {isStuckGenerating ? "生成超时" : "生成失败"}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRetry(asset); }}
              className="inline-flex items-center gap-1 rounded-full bg-blue-600/80 px-3 py-1 text-xs text-white hover:bg-blue-500 transition-colors"
            >
              <RotateCcw className="size-3" />
              重试
            </button>
          )}
        </div>
      </Card>
    );
  }

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadImage(asset.originalUrl, asset.filename);
  };

  return (
    <Card className={`group overflow-hidden cursor-pointer ${selected ? "ring-2 ring-blue-500" : ""}`} onClick={handleCardClick}>
      <div className="aspect-square bg-muted relative overflow-hidden">
        {asset.type === "VIDEO" ? (
          <video
            src={thumbUrl}
            className="size-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <BlurhashImage
            src={thumbUrl}
            alt={prompt}
            blurHash={asset.blurHash ?? undefined}
            width={asset.width ?? undefined}
            height={asset.height ?? undefined}
            className="size-full object-cover"
          />
        )}
        <Badge className="absolute top-2 left-2 text-xs" variant="secondary">
          {asset.type === "VIDEO" ? "视频" : "图片"}
        </Badge>
        {/* 选择框 */}
        {selectMode && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className={`absolute top-2 right-2 flex size-6 items-center justify-center rounded border-2 transition-colors z-10 ${
              selected ? "bg-blue-500 border-blue-500 text-white" : "bg-black/30 border-white/50 text-white"
            }`}
          >
            {selected && <CheckSquare className="size-3.5" />}
          </button>
        )}
        <button
          type="button"
          onClick={handleDownload}
          className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-full bg-zinc-800 text-white opacity-0 transition-opacity hover:bg-zinc-700 group-hover:opacity-100"
          title="下载原图"
        >
          <Download className="size-3.5" />
        </button>
        {asset.isFavorite && (
          <Heart
            className="absolute top-2 right-10 size-4 text-red-500 fill-red-500 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(asset.id);
            }}
          />
        )}
      </div>
      <div className="p-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground truncate">
          {asset.user?.name ?? ""}
        </span>
        {dateStr && (
          <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{dateStr}</span>
        )}
      </div>
    </Card>
  );
}

// ── 列表卡片 ────────────────────────────

function AssetListCard({
  asset,
  onToggleFavorite,
  onPreview,
}: {
  asset: {
    id: string;
    type: string;
    originalUrl: string;
    filename?: string;
    urlThumb?: string | null;
    blurHash?: string | null;
    width?: number | null;
    height?: number | null;
    isFavorite?: boolean;
    createdAt: Date;
    generation?: { prompt?: string } | null;
    user?: { name?: string | null } | null;
  };
  onToggleFavorite: (id: string) => void;
  onPreview: () => void;
}) {
  const thumbUrl = asset.urlThumb || asset.originalUrl;
  const prompt = asset.generation?.prompt ?? "";
  const userName = asset.user?.name;

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadImage(asset.originalUrl, asset.filename);
  };

  return (
    <Card className="flex items-center gap-4 p-3 cursor-pointer" onClick={onPreview}>
      <div className="size-16 rounded-md bg-muted shrink-0 overflow-hidden relative">
        {asset.type === "VIDEO" ? (
          <video
            src={thumbUrl}
            className="size-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <BlurhashImage
            src={thumbUrl}
            alt={prompt}
            blurHash={asset.blurHash ?? undefined}
            width={asset.width ?? undefined}
            height={asset.height ?? undefined}
            className="size-full object-cover"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{prompt}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
          {userName && <span>{userName}</span>}
          {asset.width && asset.height && (
            <span>{asset.width}×{asset.height}</span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        title="下载原图"
      >
        <Download className="size-4" />
      </button>
      {asset.isFavorite && (
        <Heart
          className="size-4 text-red-500 fill-red-500 shrink-0 cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(asset.id);
          }}
        />
      )}
    </Card>
  );
}

