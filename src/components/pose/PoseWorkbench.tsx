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
import { Plus, Trash2, Loader2, Download } from "lucide-react";
import { PoseSection } from "./PoseSection";
import { ProductCopyFields } from "./ProductCopyFields";

import { AdaptiveImage } from "@/components/ui/adaptive-image";
import { useAdminModels } from "@/hooks/use-admin-models";
import { getPoseRowImages, setPoseRowImages } from "@/lib/workbench-images";
import { downloadImage } from "@/lib/download-helper";
import { POSE_TYPES, POSE_LABELS, type PoseType } from "@/lib/pose-types";
import { cn } from "@/lib/utils";
import { compressImageForPreview } from "@/lib/image-compression";
import {
  expandColumnWidths,
  sumColumnWidths,
  useWorkbenchTableContainer,
} from "@/lib/workbench-table-layout";
import {
  ASPECT_RATIOS,
  ASPECT_RATIO_LABELS,
} from "@/server/ai-gateway/ephone/image-sizes";

type PoseColKey =
  | "index"
  | "source"
  | "poses"
  | "productTitle"
  | "productDescription"
  | "actions";

const POSE_COL_WIDTHS_KEY = "pose-workbench-col-widths";
const DEFAULT_POSE_COL_WIDTHS: Record<PoseColKey, number> = {
  index: 48,
  source: 168,
  poses: 520,
  productTitle: 160,
  productDescription: 200,
  actions: 48,
};

function usePoseColumnWidths() {
  const [widths, setWidths] = useState<Record<PoseColKey, number>>(() => {
    if (typeof window === "undefined") return DEFAULT_POSE_COL_WIDTHS;
    try {
      const raw = localStorage.getItem(POSE_COL_WIDTHS_KEY);
      if (raw) return { ...DEFAULT_POSE_COL_WIDTHS, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    return DEFAULT_POSE_COL_WIDTHS;
  });

  const persist = useCallback((next: Record<PoseColKey, number>) => {
    try {
      localStorage.setItem(POSE_COL_WIDTHS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const resizeCol = useCallback(
    (key: PoseColKey, delta: number) => {
      setWidths((prev) => {
        const next = {
          ...prev,
          [key]: Math.max(72, Math.min(800, prev[key] + delta)),
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

function colStyle(width: number) {
  return { width, minWidth: width, maxWidth: width };
}

function poseHasOutput(rows: PoseRowData[], pose: PoseType) {
  return rows.some((r) =>
    r.outputs.some((o) => o.poseType === pose && o.outputUrl),
  );
}

function PoseColumnHeader({
  rows,
  batchId,
  disabled,
  generatingPose,
  downloadingPose,
  onTogglePose,
  onGeneratePose,
  onDownloadPose,
}: {
  rows: PoseRowData[];
  batchId: string | undefined;
  disabled: boolean;
  generatingPose: PoseType | null;
  downloadingPose: PoseType | null;
  onTogglePose: (pose: PoseType) => void;
  onGeneratePose: (pose: PoseType) => void;
  onDownloadPose: (pose: PoseType) => void;
}) {
  const images = batchId ? getPoseRowImages(batchId) : {};

  return (
    <div className="grid grid-cols-4 gap-1.5 pr-2">
      {POSE_TYPES.map((pose) => {
        const count = rows.filter((r) =>
          (r.poseSelection as PoseType[]).includes(pose),
        ).length;
        const checked = rows.length > 0 && count === rows.length;
        const hasOutput = poseHasOutput(rows, pose);
        const canGenerate = rows.some((r) => images[r.id]?.source?.trim());

        return (
          <div key={pose} className="space-y-0.5">
            <label
              className={cn(
                "flex items-center gap-1 rounded border px-1 py-0.5 text-[9px] cursor-pointer w-full",
                checked
                  ? "border-primary bg-primary/10"
                  : "border-border text-muted-foreground",
                disabled && "pointer-events-none opacity-50",
              )}
              onClick={(e) => {
                e.preventDefault();
                if (!disabled) onTogglePose(pose);
              }}
            >
              <input
                type="checkbox"
                className="size-2.5 pointer-events-none shrink-0"
                checked={checked}
                readOnly
              />
              <span className="truncate">{POSE_LABELS[pose]}</span>
            </label>
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                className="h-5 flex-1 px-1 text-[9px]"
                disabled={
                  disabled || generatingPose !== null || !canGenerate
                }
                onClick={() => onGeneratePose(pose)}
              >
                {generatingPose === pose ? (
                  <Loader2 className="size-2.5 animate-spin" />
                ) : (
                  "生成"
                )}
              </Button>
              {hasOutput && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-5 w-5 p-0 shrink-0"
                  disabled={downloadingPose !== null}
                  onClick={() => onDownloadPose(pose)}
                  title={`下载本列所有${POSE_LABELS[pose]}`}
                >
                  {downloadingPose === pose ? (
                    <Loader2 className="size-2.5 animate-spin" />
                  ) : (
                    <Download className="size-2.5" />
                  )}
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type PoseRowData = {
  id: string;
  sortOrder: number;
  poseSelection: string[];
  productTitle: string | null;
  productDescription: string | null;
  outputs: {
    id: string;
    poseType: string;
    outputUrl: string;
    activeVersionId: string | null;
    versions: { id: string; outputUrl: string; createdAt: string | Date }[];
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

function SourceImageField({
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
    <div className="space-y-1 w-[164px] min-w-[160px]">
      <span className="text-[10px] text-muted-foreground">参考图</span>
      {/* 素材丢失警告 */}
      {lostHint && (
        <div className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-1 flex items-center gap-1.5">
          <span className="text-[10px] text-amber-400 leading-tight">
            {isBlobUrl ? "⚠️ 本地预览已失效，请重新上传参考图" : "⚠️ 参考图无法加载，请重新上传"}
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
          <div className="h-28 flex items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="h-28 flex flex-col items-center justify-center gap-1 px-2 text-muted-foreground">
            <span className="text-[10px]">点击选择参考图</span>
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
          更换 / 追加参考图
        </Button>
      )}
    </div>
  );
}

function PoseRow({
  index,
  row,
  batchId,
  colWidths,
  imageModelId,
  regeneratingRowPose,
  onRegenerateSinglePose,
  onRefresh,
  onImportSourceImages,
}: {
  index: number;
  row: PoseRowData;
  batchId: string;
  colWidths: Record<PoseColKey, number>;
  imageModelId: string;
  regeneratingRowPose: { rowId: string; pose: PoseType } | null;
  onRegenerateSinglePose: (rowId: string, pose: PoseType) => void;
  onRefresh: () => void;
  onImportSourceImages: (fromRowId: string, files: File[]) => Promise<void>;
}) {
  const trpc = useTRPC();

  const updateRow = useMutation(
    trpc.pose.updateRow.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );
  const deleteRow = useMutation(
    trpc.pose.deleteRow.mutationOptions({
      onSuccess: () => onRefresh(),
    }),
  );

  const stored = getPoseRowImages(batchId)[row.id];
  const [sourceUrl, setSourceUrl] = useState(stored?.source ?? "");
  const [productTitle, setProductTitle] = useState(row.productTitle ?? "");
  const [productDescription, setProductDescription] = useState(
    row.productDescription ?? "",
  );

  useEffect(() => {
    setProductTitle(row.productTitle ?? "");
    setProductDescription(row.productDescription ?? "");
    setSourceUrl(stored?.source ?? "");
  }, [row.id, batchId, row.productTitle, row.productDescription, stored?.source]);

  const updateSourceUrl = useCallback(
    (url: string) => {
      setSourceUrl(url);
      setPoseRowImages(batchId, row.id, { source: url });
    },
    [batchId, row.id],
  );

  return (
    <tr className="border-b align-top hover:bg-muted/30">
      <td
        className="p-2 text-center text-xs text-muted-foreground"
        style={colStyle(colWidths.index)}
      >
        {index + 1}
      </td>
      <td className="p-2" style={colStyle(colWidths.source)}>
        <SourceImageField
          url={sourceUrl}
          onChange={updateSourceUrl}
          onCommit={() => {}}
          onImportFiles={(files) => onImportSourceImages(row.id, files)}
        />
      </td>
      <td className="p-2" style={colStyle(colWidths.poses)}>
        <PoseSection
          sourceUrl={sourceUrl}
          poseOutputs={row.outputs}
          rowId={row.id}
          modelId={imageModelId ?? ""}
          regeneratingPose={
            regeneratingRowPose?.rowId === row.id
              ? regeneratingRowPose.pose
              : null
          }
          onRegeneratePose={(pose) =>
            void onRegenerateSinglePose(row.id, pose)
          }
          onRefresh={onRefresh}
        />
      </td>
      <td
        className="p-2 align-top"
        colSpan={2}
        style={{
          ...colStyle(colWidths.productTitle + colWidths.productDescription),
        }}
      >
        <ProductCopyFields
          rowId={row.id}
          sourceUrl={sourceUrl}
          productTitle={productTitle}
          productDescription={productDescription}
          onTitleChange={setProductTitle}
          onDescriptionChange={setProductDescription}
          onSaveTitle={() =>
            void updateRow
              .mutateAsync({ rowId: row.id, productTitle })
              .then(onRefresh)
          }
          onSaveDescription={() =>
            void updateRow
              .mutateAsync({ rowId: row.id, productDescription })
              .then(onRefresh)
          }
          onGenerated={(title, description) =>
            void updateRow
              .mutateAsync({
                rowId: row.id,
                productTitle: title,
                productDescription: description,
              })
              .then(onRefresh)
          }
        />
      </td>
      <td className="p-2" style={colStyle(colWidths.actions)}>
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

export function PoseWorkbench() {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const batchQuery = useQuery(trpc.pose.getBatch.queryOptions({}));
  const addRow = useMutation(
    trpc.pose.addRow.mutationOptions({
      onSuccess: () => refresh(),
      onError: (e) => toast.error(e.message),
    }),
  );
  const createBatch = useMutation(
    trpc.pose.createBatch.mutationOptions({
      onSuccess: () => refresh(),
    }),
  );
  const importSourceImages = useMutation(
    trpc.pose.importSourceImages.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );
  const updateRow = useMutation(
    trpc.pose.updateRow.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );
  const regeneratePose = useMutation(
    trpc.pose.regeneratePose.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );
  const { imageModelId } = useAdminModels();
  const { widths, resizeCol } = usePoseColumnWidths();
  const { containerRef, containerWidth } = useWorkbenchTableContainer();
  const displayWidths = useMemo(
    () =>
      expandColumnWidths(widths, containerWidth, [
        "poses",
        "productTitle",
        "productDescription",
      ] as readonly PoseColKey[]),
    [widths, containerWidth],
  );
  const minTableWidth = sumColumnWidths(widths);
  const [batchBusy, setBatchBusy] = useState(false);
  const [generatingPose, setGeneratingPose] = useState<PoseType | null>(null);
  const [pendingGenIds, setPendingGenIds] = useState<string[]>([]);
  const [downloadingPose, setDownloadingPose] = useState<PoseType | null>(null);
  const [aspectRatio, setAspectRatio] = useState<(typeof ASPECT_RATIOS)[number]>("1:1");
  const [regeneratingRowPose, setRegeneratingRowPose] = useState<{
    rowId: string;
    pose: PoseType;
  } | null>(null);

  const batchKey = trpc.pose.getBatch.queryKey({});

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: batchKey });
  }, [qc, batchKey]);

  const batch = batchQuery.data;
  const rows = (batch?.rows ?? []) as PoseRowData[];

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
    if (pendingGenIds.length === 0 && generatingPose) {
      toast.success(`${POSE_LABELS[generatingPose]} 生成完成`);
      setGeneratingPose(null);
      refresh();
    }
  }, [pendingGenIds, generatingPose, refresh]);

  const handleImportSourceImages = useCallback(
    async (fromRowId: string, files: File[]) => {
      if (!batch?.id) return;
      const urls = await Promise.all(files.map(uploadFile));
      const result = await importSourceImages.mutateAsync({
        batchId: batch.id,
        fromRowId,
        sourceImageUrls: urls,
      });
      if (result.created > 0) {
        toast.success(`已导入 ${urls.length} 张参考图，新增 ${result.created} 行`);
      }
      for (const a of result.assignments) {
        setPoseRowImages(batch.id, a.rowId, { source: a.sourceImageUrl });
      }
      refresh();
    },
    [batch?.id, importSourceImages, refresh],
  );

  const handleBatchTogglePose = useCallback(
    async (pose: PoseType) => {
      if (rows.length === 0) return;
      const allHave = rows.every((r) =>
        (r.poseSelection as PoseType[]).includes(pose),
      );
      setBatchBusy(true);
      try {
        for (const row of rows) {
          const current = row.poseSelection as PoseType[];
          const next = allHave
            ? current.filter((p) => p !== pose)
            : current.includes(pose)
              ? current
              : [...current, pose];
          const changed =
            current.length !== next.length ||
            !current.every((p) => next.includes(p));
          if (changed) {
            await updateRow.mutateAsync({
              rowId: row.id,
              poseSelection: next,
            });
          }
        }
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "更新姿势勾选失败");
      } finally {
        setBatchBusy(false);
      }
    },
    [rows, updateRow, refresh],
  );

  const handleBatchGeneratePose = useCallback(
    async (pose: PoseType) => {
      if (!imageModelId) {
        toast.error("请先选择图片模型");
        return;
      }
      if (!batch?.id) return;

      const images = getPoseRowImages(batch.id);
      const eligible = rows.filter((r) => images[r.id]?.source?.trim());
      if (eligible.length === 0) {
        toast.error("请先上传参考图");
        return;
      }

      setGeneratingPose(pose);
      const genIds: string[] = [];
      try {
        // 逐条串行提交，避免瞬间占满队列
        for (const row of eligible) {
          const result = await regeneratePose.mutateAsync({
            rowId: row.id,
            poseType: pose,
            sourceImageUrl: images[row.id]!.source!.trim(),
            modelId: imageModelId,
            aspectRatio,
          });
          genIds.push(result.generationId);
        }
        setPendingGenIds(genIds);
        toast.success(`已提交 ${genIds.length} 个 ${POSE_LABELS[pose]} 生成任务`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "生成失败");
        setGeneratingPose(null);
      }
    },
    [batch?.id, rows, imageModelId, aspectRatio, regeneratePose, refresh],
  );

  const handleRegenerateSinglePose = useCallback(
    async (rowId: string, pose: PoseType) => {
      if (!imageModelId) {
        toast.error("请先选择图片模型");
        return;
      }
      if (!batch?.id) return;
      const images = getPoseRowImages(batch.id);
      const sourceUrl = images[rowId]?.source?.trim();
      if (!sourceUrl) {
        toast.error("请先上传参考图");
        return;
      }
      setRegeneratingRowPose({ rowId, pose });
      try {
        const result = await regeneratePose.mutateAsync({
          rowId,
          poseType: pose,
          sourceImageUrl: sourceUrl,
          modelId: imageModelId,
        });
        setPendingGenIds([result.generationId]);
        toast.success(`已提交 ${POSE_LABELS[pose]} 重新生成`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "重新生成失败");
        setRegeneratingRowPose(null);
      }
    },
    [batch?.id, imageModelId, aspectRatio, regeneratePose],
  );

  // Clear regenerating state when pending generation completes
  useEffect(() => {
    if (pendingGenIds.length === 0 && regeneratingRowPose) {
      setRegeneratingRowPose(null);
      refresh();
    }
  }, [pendingGenIds, regeneratingRowPose, refresh]);

  const handleDownloadPose = useCallback(
    async (pose: PoseType) => {
      const items: { url: string; label: string }[] = [];
      for (let i = 0; i < rows.length; i++) {
        const output = rows[i].outputs.find((o) => o.poseType === pose);
        if (!output?.outputUrl) continue;
        const active =
          output.versions.find((v) => v.id === output.activeVersionId) ??
          output.versions[0];
        const url = active?.outputUrl ?? output.outputUrl;
        if (url) {
          items.push({
            url,
            label: `${i + 1}-${POSE_LABELS[pose]}.png`,
          });
        }
      }

      if (items.length === 0) {
        toast.error(`没有可下载的${POSE_LABELS[pose]}`);
        return;
      }

      setDownloadingPose(pose);
      try {
        for (let i = 0; i < items.length; i++) {
          downloadImage(items[i].url, items[i].label);
          // 浏览器并发下载限制约 10 个，逐一下载间隔 300ms 避免丢失
          if (i < items.length - 1) {
            await new Promise((r) => setTimeout(r, 300));
          }
        }
        toast.success(`已下载 ${items.length} 张图片`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "下载失败");
      } finally {
        setDownloadingPose(null);
      }
    },
    [rows],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">多姿势</h1>
          <p className="text-xs text-muted-foreground">
            上传参考图，按姿势单独生成，可在历史版本中对比多次生成效果
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
            onClick={() =>
              createBatch.mutate({
                title: `任务 ${new Date().toLocaleDateString()}`,
              })
            }
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
              {(Object.keys(widths) as PoseColKey[]).map((key) => (
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
                  width={displayWidths.source}
                  onResize={(d) => resizeCol("source", d)}
                >
                  参考图
                </ResizableTh>
                <ResizableTh
                  width={displayWidths.poses}
                  onResize={(d) => resizeCol("poses", d)}
                >
                  <PoseColumnHeader
                    rows={rows}
                    batchId={batch?.id}
                    disabled={batchBusy || rows.length === 0}
                    generatingPose={generatingPose}
                    downloadingPose={downloadingPose}
                    onTogglePose={(pose) => void handleBatchTogglePose(pose)}
                    onGeneratePose={(pose) => void handleBatchGeneratePose(pose)}
                    onDownloadPose={(pose) => void handleDownloadPose(pose)}
                  />
                </ResizableTh>
                <ResizableTh
                  width={
                    displayWidths.productTitle +
                    displayWidths.productDescription
                  }
                  onResize={(d) => {
                    resizeCol("productTitle", d / 2);
                    resizeCol("productDescription", d / 2);
                  }}
                  className="col-span-2"
                >
                  商品文案（标题 / 描述）
                </ResizableTh>
                <ResizableTh
                  width={displayWidths.actions}
                  onResize={(d) => resizeCol("actions", d)}
                >
                  {" "}
                </ResizableTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <PoseRow
                  key={row.id}
                  index={i}
                  row={row}
                  batchId={batch!.id}
                  colWidths={displayWidths}
                  imageModelId={imageModelId ?? ""}
                  regeneratingRowPose={regeneratingRowPose}
                  onRegenerateSinglePose={handleRegenerateSinglePose}
                  onRefresh={refresh}
                  onImportSourceImages={handleImportSourceImages}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
