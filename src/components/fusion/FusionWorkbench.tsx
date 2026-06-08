"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  RefreshCw,
  ArrowDownToLine,
  Loader2,
  History,
  Maximize2,
} from "lucide-react";

import { AdaptiveImage } from "@/components/ui/adaptive-image";
import { ImagePreviewModal } from "@/components/ui/image-preview-modal";
import { useAdminModels } from "@/hooks/use-admin-models";
import { useActiveTasks } from "@/hooks/use-active-tasks";
import { compressImageForPreview } from "@/lib/image-compression";
import { getFusionRowImages, setFusionRowImages } from "@/lib/workbench-images";
import { downloadImage } from "@/lib/download-helper";
import {
  ASPECT_RATIOS,
  ASPECT_RATIO_LABELS,
} from "@/server/ai-gateway/ephone/image-sizes";
import {
  expandColumnWidths,
  sumColumnWidths,
  useWorkbenchTableContainer,
} from "@/lib/workbench-table-layout";

type FusionColKey =
  | "index"
  | "print"
  | "base"
  | "prompt"
  | "preview"
  | "remark"
  | "actions";

const FUSION_COL_WIDTHS_KEY = "fusion-workbench-col-widths";
const DEFAULT_FUSION_COL_WIDTHS: Record<FusionColKey, number> = {
  index: 48,
  print: 168,
  base: 168,
  prompt: 240,
  preview: 200,
  remark: 120,
  actions: 48,
};

function useFusionColumnWidths() {
  const [widths, setWidths] = useState<Record<FusionColKey, number>>(() => {
    if (typeof window === "undefined") return DEFAULT_FUSION_COL_WIDTHS;
    try {
      const raw = localStorage.getItem(FUSION_COL_WIDTHS_KEY);
      if (raw) return { ...DEFAULT_FUSION_COL_WIDTHS, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return DEFAULT_FUSION_COL_WIDTHS;
  });

  const persist = useCallback((next: Record<FusionColKey, number>) => {
    try {
      localStorage.setItem(FUSION_COL_WIDTHS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const resizeCol = useCallback(
    (key: FusionColKey, delta: number) => {
      setWidths((prev) => {
        const next = {
          ...prev,
          [key]: Math.max(72, Math.min(640, prev[key] + delta)),
        };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { widths, resizeCol };
}

function ColumnResizer({ onResize }: { onResize: (delta: number) => void }) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    let lastX = e.clientX;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - lastX;
      lastX = ev.clientX;
      onResize(delta);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize touch-none hover:bg-primary/25 active:bg-primary/40"
      onMouseDown={onMouseDown}
    />
  );
}

function ResizableTh({
  width,
  onResize,
  className,
  children,
}: {
  width: number;
  onResize: (delta: number) => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <th
      className={`relative p-2 font-medium ${className ?? ""}`}
      style={{ width, minWidth: width, maxWidth: width }}
    >
      {children}
      <ColumnResizer onResize={onResize} />
    </th>
  );
}

type FusionRowData = {
  id: string;
  sortOrder: number;
  baseGroupAnchorId: string | null;
  baseGroupSize: number | null;
  prompt: string;
  remark: string | null;
  activeVersionId: string | null;
  versions: {
    id: string;
    prompt: string;
    outputUrl: string;
    createdAt: Date;
  }[];
};

/** 上传原图到服务端（不压缩，保证 AI 生成画质） */
async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? "上传失败");
  return data.url!;
}

function BaseImageField({
  url,
  onChange,
  onCommit,
  onImportFiles,
}: {
  url: string;
  onChange: (url: string) => void;
  onCommit: (url: string) => void;
  onImportFiles: (files: File[]) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState(false);

  // blob: URL 在页面刷新后立即失效；img onError 兜底服务端链接过期
  const isBlobUrl = url.startsWith("blob:");
  const lostHint = isBlobUrl || imgError;

  // 每次 url 变化时重置错误状态
  useEffect(() => { setImgError(false); }, [url]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toast.error("请选择图片文件");
      return;
    }
    if (list.length === 1) {
      // 单文件：压缩预览先行，原图异步上传（保证 AI 画质）
      const file = list[0];
      let previewUrl = "";
      try {
        const preview = await compressImageForPreview(file, 1200);
        previewUrl = preview.url;
        onChange(previewUrl); // 立即显示压缩预览，秒开不卡
      } catch {
        // 压缩失败也继续，只是没有即时预览
      }
      setUploading(true);
      try {
        const serverUrl = await uploadFile(file); // 上传原图
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        onChange(serverUrl);
        onCommit(serverUrl);
      } catch (e) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        onChange("");
        toast.error(e instanceof Error ? e.message : "上传失败");
      } finally {
        setUploading(false);
      }
    } else {
      setUploading(true);
      try {
        await onImportFiles(list);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "上传失败");
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div className="space-y-1 w-full min-w-0">
      <span className="text-[10px] text-muted-foreground">印花</span>
      {/* 素材丢失警告 */}
      {lostHint && (
        <div className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-1 flex items-center gap-1.5">
          <span className="text-[10px] text-amber-400 leading-tight">
            {isBlobUrl ? "⚠️ 本地预览已失效，请重新上传印花" : "⚠️ 印花图片无法加载，请重新上传"}
          </span>
        </div>
      )}
      {!url && !lostHint && (
        <Input
          value={url}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
          placeholder="粘贴图片链接"
          className="h-7 text-xs"
        />
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        multiple
        className="hidden"
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded border border-dashed bg-muted/30 hover:bg-muted/60 transition-colors overflow-hidden disabled:opacity-60"
      >
        {url ? (
          <div className="relative">
            <AdaptiveImage src={url} maxHeightClass="max-h-48" className="border-0 rounded-none" onError={() => setImgError(true)} />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <Loader2 className="size-5 animate-spin text-white" />
              </div>
            )}
          </div>
        ) : uploading ? (
          <div className="h-24 flex items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="h-24 flex flex-col items-center justify-center gap-1 px-2 text-muted-foreground">
            <span className="text-[10px]">点击批量添加印花</span>
            <span className="text-[9px] opacity-70">可多选，自动扩展行</span>
          </div>
        )}
      </button>
      {url && !uploading && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs w-full"
          onClick={() => inputRef.current?.click()}
        >
          更换 / 追加印花
        </Button>
      )}
    </div>
  );
}

function PrintImageField({
  url,
  groupSize,
  onChange,
  onCommit,
  onImportFiles,
}: {
  url: string;
  groupSize: number;
  onChange: (url: string) => void;
  onCommit: (url: string) => void;
  onImportFiles: (files: File[]) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState(false);

  const isBlobUrl = url.startsWith("blob:");
  const lostHint = isBlobUrl || imgError;

  useEffect(() => { setImgError(false); }, [url]);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toast.error("请选择图片文件");
      return;
    }
    if (list.length > groupSize) {
      toast.error(`印花最多 ${groupSize} 张（与底版数量一致）`);
      return;
    }
    if (list.length === 1) {
      // 单文件：压缩预览先行，原图异步上传（保证 AI 画质）
      const file = list[0];
      let previewUrl = "";
      try {
        const preview = await compressImageForPreview(file, 1200);
        previewUrl = preview.url;
        onChange(previewUrl);
      } catch {
        // 压缩失败也继续
      }
      setUploading(true);
      try {
        const serverUrl = await uploadFile(file);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        onChange(serverUrl);
        onCommit(serverUrl);
      } catch (e) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        onChange("");
        toast.error(e instanceof Error ? e.message : "上传失败");
      } finally {
        setUploading(false);
      }
    } else {
      setUploading(true);
      try {
        await onImportFiles(list);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "上传失败");
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div className="space-y-1 w-full min-w-0">
      <span className="text-[10px] text-muted-foreground">
        印花（本组 {groupSize} 行，最多 {groupSize} 张）
      </span>
      {/* 素材丢失警告 */}
      {lostHint && (
        <div className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-1 flex items-center gap-1.5">
          <span className="text-[10px] text-amber-400 leading-tight">
            {isBlobUrl ? "⚠️ 本地预览已失效，请重新上传印花" : "⚠️ 印花图片无法加载，请重新上传"}
          </span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        multiple
        className="hidden"
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded border border-dashed bg-muted/30 hover:bg-muted/60 transition-colors overflow-hidden disabled:opacity-60"
      >
        {url ? (
          <div className="relative">
            <AdaptiveImage src={url} maxHeightClass="max-h-48" className="border-0 rounded-none" onError={() => setImgError(true)} />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <Loader2 className="size-5 animate-spin text-white" />
              </div>
            )}
          </div>
        ) : uploading ? (
          <div className="h-24 flex items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="h-24 flex flex-col items-center justify-center gap-1 px-2 text-muted-foreground">
            <span className="text-[10px]">点击批量添加印花</span>
            <span className="text-[9px] opacity-70">最多 {groupSize} 张</span>
          </div>
        )}
      </button>
      {url && !uploading && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs w-full"
          onClick={() => inputRef.current?.click()}
        >
          更换印花
        </Button>
      )}
    </div>
  );
}

function ImageField({
  label,
  url,
  onChange,
  onCommit,
  replaceLabel = "更换",
  emptyHint = "点击上传",
}: {
  label: string;
  url: string;
  onChange: (url: string) => void;
  onCommit: (url: string) => void;
  replaceLabel?: string;
  emptyHint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState(false);

  const isBlobUrl = url.startsWith("blob:");
  const lostHint = isBlobUrl || imgError;

  useEffect(() => { setImgError(false); }, [url]);

  const onFile = async (file: File) => {
    // 压缩预览先行，原图异步上传（保证 AI 画质）
    let previewUrl = "";
    try {
      const preview = await compressImageForPreview(file, 1200);
      previewUrl = preview.url;
      onChange(previewUrl); // 立即显示压缩预览，秒开不卡
    } catch {
      // 压缩失败也继续
    }
    setUploading(true);
    try {
      const serverUrl = await uploadFile(file); // 上传原图
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      onChange(serverUrl);
      onCommit(serverUrl);
    } catch (e) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      onChange("");
      toast.error(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1 w-full min-w-0">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {/* 素材丢失警告 */}
      {lostHint && (
        <div className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-1 flex items-center gap-1.5">
          <span className="text-[10px] text-amber-400 leading-tight">
            {isBlobUrl ? "⚠️ 本地预览已失效，请重新上传" : `⚠️ ${label}无法加载，请重新上传`}
          </span>
        </div>
      )}
      {!url && !lostHint && (
        <Input
          value={url}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onCommit(e.target.value)}
          placeholder="粘贴图片链接"
          className="h-7 text-xs"
        />
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded border border-dashed bg-muted/30 hover:bg-muted/60 transition-colors overflow-hidden disabled:opacity-60"
      >
        {url ? (
          <div className="relative">
            <AdaptiveImage src={url} maxHeightClass="max-h-48" className="border-0 rounded-none" onError={() => setImgError(true)} />
            {uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <Loader2 className="size-5 animate-spin text-white" />
              </div>
            )}
          </div>
        ) : uploading ? (
          <div className="h-24 flex items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="h-24 flex items-center justify-center text-[10px] text-muted-foreground">
            {emptyHint}
          </div>
        )}
      </button>
      {url && !uploading && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs w-full"
          onClick={() => inputRef.current?.click()}
        >
          {replaceLabel}
        </Button>
      )}
    </div>
  );
}

function FusionRow({
  index,
  row,
  batchId,
  aspectRatio,
  onRefresh,
  onImportBaseImages,
  onImportPrintImages,
  onFillDownBase,
}: {
  index: number;
  row: FusionRowData;
  batchId: string;
  aspectRatio: (typeof ASPECT_RATIOS)[number];
  onRefresh: () => void;
  onImportBaseImages: (fromRowId: string, files: File[]) => Promise<void>;
  onImportPrintImages: (anchorRowId: string, files: File[]) => Promise<void>;
  onFillDownBase: (fromRowId: string) => void;
}) {
  const isGroupAnchor =
    row.baseGroupAnchorId === row.id && (row.baseGroupSize ?? 0) > 0;
  const isGroupMember =
    !!row.baseGroupAnchorId && row.baseGroupAnchorId !== row.id;
  const trpc = useTRPC();
  const [generating, setGenerating] = useState(false);
  const [pendingGenId, setPendingGenId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  const updateRow = useMutation(
    trpc.fusion.updateRow.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );

  const { imageModelId } = useAdminModels();
  const generate = useMutation(trpc.fusion.generate.mutationOptions());
  const setVersion = useMutation(
    trpc.fusion.setActiveVersion.mutationOptions({
      onSuccess: () => onRefresh(),
    }),
  );
  const deleteRow = useMutation(
    trpc.fusion.deleteRow.mutationOptions({
      onSuccess: () => onRefresh(),
    }),
  );
  const fillDown = useMutation(
    trpc.fusion.fillDownPrompt.mutationOptions({
      onSuccess: (d) => {
        toast.success(`已向下填充 ${d.updated} 行`);
        onRefresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  // 必须在 genStatusQuery 之前声明
  const pendingStartRef = useRef<number | null>(null);
  // 记录已完成的 generation ID，防止 activeTasksQuery stale cache 重新触发
  const completedGenIdsRef = useRef<Set<string>>(new Set());
  const qc = useQueryClient();

  // 切页回来恢复：从全局活跃任务中检测本行是否有正在生成的任务
  const activeTasksQuery = useActiveTasks();
  useEffect(() => {
    if (!activeTasksQuery.data || pendingGenId) return;
    const activeForRow = activeTasksQuery.data.find(
      (t) =>
        t.fusionRowId === row.id &&
        (t.status === "PROCESSING" || t.status === "QUEUED" || t.status === "PENDING") &&
        !completedGenIdsRef.current.has(t.id),
    );
    if (activeForRow) {
      setPendingGenId(activeForRow.id);
      setGenerating(true);
      pendingStartRef.current = new Date(activeForRow.startedAt ?? activeForRow.createdAt).getTime();
    }
  }, [activeTasksQuery.data, row.id, pendingGenId]);

  // 仅当 pendingGenId 从无到有时同步计时起点（不从已有值覆盖）
  const prevGenIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (pendingGenId && pendingGenId !== prevGenIdRef.current) {
      // 新任务：如果用恢复的时间点则保留，否则取当前时间
      if (!pendingStartRef.current) {
        pendingStartRef.current = Date.now();
      }
    }
    if (!pendingGenId) {
      pendingStartRef.current = null;
    }
    prevGenIdRef.current = pendingGenId;
  }, [pendingGenId]);

  const genStatusQuery = useQuery({
    ...trpc.generation.getStatus.queryOptions({ generationId: pendingGenId! }),
    enabled: !!pendingGenId,
    refetchInterval: () => {
      const s = pendingStartRef.current;
      if (!s) return 2000;
      const dt = Date.now() - s;
      if (dt < 10_000) return 1000;
      if (dt < 30_000) return 2000;
      if (dt < 70_000) return 4000;
      if (dt < 150_000) return 8000;
      return 10_000;
    },
  });

  // 耗时计时器 — 用后端的 startedAt/createdAt 计算，切页不重置
  useEffect(() => {
    if (!generating) { setElapsed(0); return; }
    const startTime = genStatusQuery.data?.startedAt
      ? new Date(genStatusQuery.data.startedAt).getTime()
      : genStatusQuery.data?.createdAt
        ? new Date(genStatusQuery.data.createdAt).getTime()
        : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - startTime) / 1000));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [generating, genStatusQuery.data?.startedAt, genStatusQuery.data?.createdAt]);
  useEffect(() => {
    if (!genStatusQuery.data) return;
    const gen = genStatusQuery.data;
    if (gen.status === "COMPLETED" || gen.status === "FAILED") {
      // 记录为已完成，防止 activeTasksQuery stale cache 重新触发
      completedGenIdsRef.current.add(gen.id);
      // 失效 activeTasks 缓存，确保下次查询拿到最新数据
      qc.invalidateQueries({ queryKey: trpc.generation.getActiveTasks.queryKey() });
      if (gen.status === "COMPLETED") {
        setPendingGenId(null);
        setGenerating(false);
        onRefresh();
      } else {
        toast.error(gen.errorMessage ?? "融合图生成失败");
        setPendingGenId(null);
        setGenerating(false);
        onRefresh();
      }
    }
  }, [genStatusQuery.data]);

  // 前端超时兜底：超过 5 分钟无结果 → 视为失败，允许用户重试
  useEffect(() => {
    if (!generating || !pendingGenId) return;
    const currentGenId = pendingGenId;
    const timeout = setTimeout(() => {
      completedGenIdsRef.current.add(currentGenId);
      qc.invalidateQueries({ queryKey: trpc.generation.getActiveTasks.queryKey() });
      setGenerating(false);
      setPendingGenId(null);
      toast.error("生成超时，请重试");
    }, 5 * 60 * 1000);
    return () => clearTimeout(timeout);
  }, [generating, pendingGenId]);

  const activeVersion =
    row.versions.find((v) => v.id === row.activeVersionId) ?? row.versions[0];

  const [prompt, setPrompt] = useState(row.prompt);
  const [remark, setRemark] = useState(row.remark ?? "");
  const stored = getFusionRowImages(batchId)[row.id];
  const [baseUrl, setBaseUrl] = useState(stored?.base ?? "");
  const [printUrl, setPrintUrl] = useState(stored?.print ?? "");

  const save = useCallback(
    async (data: Parameters<typeof updateRow.mutateAsync>[0]) => {
      await updateRow.mutateAsync(data);
      onRefresh();
    },
    [updateRow, onRefresh],
  );

  useEffect(() => {
    setPrompt(row.prompt);
    setRemark(row.remark ?? "");
    setBaseUrl(stored?.base ?? "");
    setPrintUrl(stored?.print ?? "");
  }, [row.id, batchId, row.prompt, row.remark, stored?.base, stored?.print]);

  const updateBaseUrl = useCallback(
    (url: string) => {
      setBaseUrl(url);
      setFusionRowImages(batchId, row.id, { base: url });
    },
    [batchId, row.id],
  );

  const updatePrintUrl = useCallback(
    (url: string) => {
      setPrintUrl(url);
      setFusionRowImages(batchId, row.id, { print: url });
    },
    [batchId, row.id],
  );

  const handleGenerate = async () => {
    if (!imageModelId) {
      toast.error("请先选择图片模型");
      return;
    }
    setGenerating(true);
    try {
      await save({ rowId: row.id, prompt });
      const result = await generate.mutateAsync({
        rowId: row.id,
        modelId: imageModelId,
        baseImageUrl: baseUrl,
        printImageUrl: printUrl,
        aspectRatio,
      });
      setPendingGenId(result.generationId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
      setGenerating(false);
    }
  };

  return (
    <tr className="border-b align-top hover:bg-muted/30">
      <td className="p-2 text-center text-xs text-muted-foreground w-10">
        {index + 1}
      </td>
      <td className="p-2">
        <BaseImageField
          url={printUrl}
          onChange={updatePrintUrl}
          onCommit={() => {}}
          onImportFiles={(files) => onImportBaseImages(row.id, files)}
        />
      </td>
      <td className="p-2">
        <div className="space-y-1 w-full min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-muted-foreground">底版</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 px-1 text-[9px] gap-0.5"
              title="将底版填充到下方所有行"
              disabled={!baseUrl.trim()}
              onClick={() => onFillDownBase(row.id)}
            >
              <ArrowDownToLine className="size-2.5" />
              向下填充
            </Button>
          </div>
          <ImageField
            label=""
            url={baseUrl}
            onChange={updateBaseUrl}
            onCommit={() => {}}
            replaceLabel="更换底版"
            emptyHint="点击上传底版"
          />
        </div>
      </td>
      <td className="p-2 overflow-hidden">
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-[10px] text-muted-foreground">融合图提示词</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px] gap-0.5"
            title="将本行提示词填充到下方所有行"
            onClick={() =>
              fillDown.mutate({ batchId, fromRowId: row.id })
            }
          >
            <ArrowDownToLine className="size-3" />
            向下填充
          </Button>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={() => save({ rowId: row.id, prompt })}
          placeholder="描述印花如何融合到底版…"
          className="min-h-[88px] text-xs resize-y"
        />
      </td>
      <td className="p-2 overflow-hidden">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground">融合图预览</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-0.5"
            disabled={generating || !baseUrl || !printUrl}
            onClick={handleGenerate}
          >
            {generating ? (
              <>
                <Loader2 className="size-3 animate-spin" />
                {elapsed}s
              </>
            ) : (
              <>
                <RefreshCw className="size-3" />
                {activeVersion ? "重新生成" : "生成"}
              </>
            )}
          </Button>
        </div>
        {generating ? (
          activeVersion ? (
            // 有旧图时在图上叠加生成指示
            <div className="relative">
              <AdaptiveImage src={activeVersion.outputUrl} maxHeightClass="max-h-64 opacity-60" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/20">
                <Loader2 className="size-5 animate-spin text-blue-400" />
                <span className="text-xs text-blue-400">{elapsed}s</span>
              </div>
            </div>
          ) : (
            <div className="h-32 rounded border border-dashed border-blue-500/30 bg-blue-500/5 flex flex-col items-center justify-center gap-2">
              <Loader2 className="size-5 animate-spin text-blue-400" />
              <span className="text-xs text-blue-400">{elapsed}s</span>
            </div>
          )
        ) : activeVersion ? (
          <button
            type="button"
            className="group relative w-full cursor-zoom-in"
            onClick={() => setPreviewSrc(activeVersion.outputUrl)}
            title="点击查看大图"
          >
            <AdaptiveImage src={activeVersion.outputUrl} maxHeightClass="max-h-64" />
            <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 className="size-3" />
            </span>
          </button>
        ) : (
          <div className="h-32 rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">
            待生成
          </div>
        )}
        {previewSrc && (
          <ImagePreviewModal
            open={!!previewSrc}
            onClose={() => setPreviewSrc(null)}
            src={previewSrc}
            downloadUrl={previewSrc}
            alt="融合图预览"
          />
        )}
        {row.versions.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1">
            <History className="size-3 text-muted-foreground shrink-0" />
            <Select
              value={row.activeVersionId ?? activeVersion?.id ?? ""}
              onValueChange={(v) => {
                if (v) setVersion.mutate({ rowId: row.id, versionId: v });
              }}
            >
              <SelectTrigger className="h-7 text-[10px] flex-1">
                <SelectValue placeholder="历史版本" />
              </SelectTrigger>
              <SelectContent>
                {row.versions.map((v, i) => (
                  <SelectItem key={v.id} value={v.id}>
                    v{row.versions.length - i} ·{" "}
                    {new Date(v.createdAt).toLocaleString("zh-CN", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </td>
      <td className="p-2 overflow-hidden">
        <span className="text-[10px] text-muted-foreground">备注</span>
        <Textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          onBlur={() => save({ rowId: row.id, remark })}
          className="mt-1 min-h-[60px] text-xs"
        />
      </td>
      <td className="p-2 w-10">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 text-destructive"
          onClick={() => deleteRow.mutate({ rowId: row.id })}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </td>
    </tr>
  );
}

export function FusionWorkbench() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { widths, resizeCol } = useFusionColumnWidths();
  const { containerRef, containerWidth } = useWorkbenchTableContainer();
  const displayWidths = useMemo(
    () =>
      expandColumnWidths(widths, containerWidth, [
        "prompt",
        "preview",
        "remark",
      ] as readonly FusionColKey[]),
    [widths, containerWidth],
  );
  const minTableWidth = sumColumnWidths(widths);

  const batchQuery = useQuery(trpc.fusion.getBatch.queryOptions({}));
  const addRow = useMutation(
    trpc.fusion.addRow.mutationOptions({
      onSuccess: () => refresh(),
      onError: (e) => toast.error(e.message),
    }),
  );
  const createBatch = useMutation(
    trpc.fusion.createBatch.mutationOptions({
      onSuccess: () => refresh(),
    }),
  );
  const importBaseImages = useMutation(
    trpc.fusion.importBaseImages.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );
  const importPrintImages = useMutation(
    trpc.fusion.importPrintImages.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );
  const updateRow = useMutation(
    trpc.fusion.updateRow.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );
  const generate = useMutation(
    trpc.fusion.generate.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );
  const { imageModelId } = useAdminModels();
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [pendingGenIds, setPendingGenIds] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>("1:1");

  const batchKey = trpc.fusion.getBatch.queryKey({});

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: batchKey });
  }, [qc, batchKey]);

  const batch = batchQuery.data;
  const rows = (batch?.rows ?? []) as FusionRowData[];

  const batchPollQuery = useQuery({
    ...trpc.generation.getStatus.queryOptions({ generationId: pendingGenIds[0]! }),
    enabled: pendingGenIds.length > 0,
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (!batchPollQuery.data || pendingGenIds.length === 0) return;
    const gen = batchPollQuery.data;
    if (gen.status === "COMPLETED" || gen.status === "FAILED") {
      setPendingGenIds((prev) => prev.filter((id) => id !== gen.id));
    }
  }, [batchPollQuery.data, refresh, pendingGenIds]);

  useEffect(() => {
    if (pendingGenIds.length === 0 && batchGenerating) {
      toast.success("批量生成完成");
      setBatchGenerating(false);
      refresh();
    }
  }, [pendingGenIds, batchGenerating, refresh]);

  const handleImportBaseImages = useCallback(
    async (fromRowId: string, files: File[]) => {
      if (!batch?.id) return;
      const urls = await Promise.all(files.map(uploadFile));
      const result = await importBaseImages.mutateAsync({
        batchId: batch.id,
        fromRowId,
        baseImageUrls: urls,
      });
      if (result.created > 0) {
        toast.success(`已导入 ${urls.length} 张印花，新增 ${result.created} 行`);
      }
      for (const a of result.assignments) {
        setFusionRowImages(batch.id, a.rowId, { print: a.baseImageUrl });
      }
      refresh();
    },
    [batch?.id, importBaseImages, refresh],
  );

  const handleImportPrintImages = useCallback(
    async (anchorRowId: string, files: File[]) => {
      if (!batch?.id) return;
      const anchor = rows.find((r) => r.id === anchorRowId);
      const b = anchor?.baseGroupSize ?? 0;
      if (files.length > b) {
        toast.error(`底版最多 ${b} 张（与印花数量一致）`);
        return;
      }
      const urls = await Promise.all(files.map(uploadFile));
      const result = await importPrintImages.mutateAsync({
        batchId: batch.id,
        anchorRowId,
        printImageUrls: urls,
      });
      toast.success(`已分配 ${urls.length} 张底版`);
      for (const a of result.assignments) {
        setFusionRowImages(batch.id, a.rowId, { print: a.printImageUrl });
      }
      refresh();
    },
    [batch?.id, importPrintImages, refresh, rows],
  );

  const handleFillDownBase = useCallback(
    (fromRowId: string) => {
      if (!batch?.id) return;
      const images = getFusionRowImages(batch.id);
      const base = images[fromRowId]?.base;
      if (!base) {
        toast.error("当前行没有底版图片");
        return;
      }
      const fromIdx = rows.findIndex((r) => r.id === fromRowId);
      if (fromIdx < 0) return;
      let count = 0;
      for (let i = fromIdx + 1; i < rows.length; i++) {
        setFusionRowImages(batch.id, rows[i].id, { base });
        count++;
      }
      if (count > 0) {
        toast.success(`已将底版填充到下方 ${count} 行`);
        refresh();
      }
    },
    [batch?.id, rows, refresh],
  );

  const handleGenerateColumn = useCallback(async () => {
    if (!imageModelId) {
      toast.error("请先选择图片模型");
      return;
    }
    if (!batch?.id) return;

    const images = getFusionRowImages(batch.id);
    const eligible = rows.filter((r) => {
      const imgs = images[r.id];
      return imgs?.base?.trim() && imgs?.print?.trim();
    });

    if (eligible.length === 0) {
      toast.error("没有可生成的行，请先上传印花和底版");
      return;
    }

    setBatchGenerating(true);
    const genIds: string[] = [];
    try {
      // 逐条串行提交，避免瞬间占满队列导致 API 端互相拖慢
      for (const row of eligible) {
        const imgs = images[row.id]!;
        await updateRow.mutateAsync({ rowId: row.id, prompt: row.prompt });
        const result = await generate.mutateAsync({
          rowId: row.id,
          modelId: imageModelId,
          baseImageUrl: imgs.base!,
          printImageUrl: imgs.print!,
          aspectRatio,
        });
        genIds.push(result.generationId);
      }
      setPendingGenIds(genIds);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量生成失败");
      setBatchGenerating(false);
    }
  }, [batch?.id, rows, imageModelId, aspectRatio, updateRow, generate, refresh]);

  const handleDownloadAll = useCallback(async () => {
    const versions = rows
      .map((r) => r.versions.find((v) => v.id === r.activeVersionId) ?? r.versions[0])
      .filter((v): v is NonNullable<typeof v> => v != null);

    if (versions.length === 0) {
      toast.error("没有可下载的融合图");
      return;
    }

    setDownloading(true);
    try {
      const images = getFusionRowImages(batch!.id!);
      for (let i = 0; i < versions.length; i++) {
        const printName = images[rows[i]?.id]?.printName;
        const base = printName
          ? printName.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]/g, "_")
          : "fusion";
        downloadImage(versions[i].outputUrl, `${base}_fusion_${i + 1}.png`);
        // 浏览器对连续下载有限制，间隔 300ms 防止丢图
        if (i < versions.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
      toast.success(`已下载 ${versions.length} 张图片`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "下载失败");
    } finally {
      setDownloading(false);
    }
  }, [rows]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">融合图</h1>
          <p className="text-xs text-muted-foreground">
            上传印花与底版，填写提示词生成融合预览
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={aspectRatio}
            onValueChange={(v) => v && setAspectRatio(v as (typeof ASPECT_RATIOS)[number])}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIOS.map((r) => (
                <SelectItem key={r} value={r}>
                  {ASPECT_RATIO_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => createBatch.mutate({ title: `任务 ${new Date().toLocaleDateString()}` })}
          >
            新建任务
          </Button>
          <Button
            size="sm"
            className="gap-1"
            disabled={!batch?.id}
            onClick={() => batch && addRow.mutate({ batchId: batch.id })}
          >
            <Plus className="size-4" />
            添加行
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto min-w-0">
        {batchQuery.isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <table
            className="w-full border-collapse text-sm"
            style={{ tableLayout: "fixed", minWidth: minTableWidth }}
          >
            <colgroup>
              {(Object.keys(widths) as FusionColKey[]).map((key) => (
                <col key={key} style={{ width: displayWidths[key] }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="border-b text-left text-xs text-muted-foreground">
                <ResizableTh
                  width={displayWidths.index}
                  onResize={(d) => resizeCol("index", d)}
                >
                  序号
                </ResizableTh>
                <ResizableTh
                  width={displayWidths.print}
                  onResize={(d) => resizeCol("print", d)}
                >
                  印花
                </ResizableTh>
                <ResizableTh
                  width={displayWidths.base}
                  onResize={(d) => resizeCol("base", d)}
                >
                  底版
                </ResizableTh>
                <ResizableTh
                  width={displayWidths.prompt}
                  onResize={(d) => resizeCol("prompt", d)}
                >
                  融合图提示词
                </ResizableTh>
                <ResizableTh
                  width={displayWidths.preview}
                  onResize={(d) => resizeCol("preview", d)}
                >
                  <div className="flex items-center justify-between gap-1 pr-2">
                    <span>融合图预览</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] shrink-0"
                        disabled={downloading || rows.length === 0}
                        onClick={() => void handleDownloadAll()}
                        title="下载本列所有融合图"
                      >
                        {downloading ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "下载"
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-6 text-[10px] shrink-0"
                        disabled={batchGenerating || rows.length === 0}
                        onClick={() => void handleGenerateColumn()}
                      >
                        {batchGenerating ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "生成"
                        )}
                      </Button>
                    </div>
                  </div>
                </ResizableTh>
                <ResizableTh
                  width={displayWidths.remark}
                  onResize={(d) => resizeCol("remark", d)}
                >
                  备注
                </ResizableTh>
                <th
                  className="p-2"
                  style={{
                    width: displayWidths.actions,
                    minWidth: displayWidths.actions,
                    maxWidth: displayWidths.actions,
                  }}
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <FusionRow
                  key={row.id}
                  index={i}
                  row={row}
                  batchId={batch!.id}
                  aspectRatio={aspectRatio}
                  onRefresh={refresh}
                  onImportBaseImages={handleImportBaseImages}
                  onImportPrintImages={handleImportPrintImages}
                  onFillDownBase={handleFillDownBase}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
