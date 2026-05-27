"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History, RefreshCw, Eye } from "lucide-react";
import { POSE_TYPES, type PoseType } from "@/lib/pose-types";
import { AdaptiveImage } from "@/components/ui/adaptive-image";

export type PoseOutputData = {
  id: string;
  poseType: string;
  outputUrl: string;
  activeVersionId: string | null;
  versions: { id: string; outputUrl: string; createdAt: string | Date }[];
};

function displayUrl(output?: PoseOutputData) {
  if (!output?.outputUrl) return null;
  const active =
    output.versions.find((v) => v.id === output.activeVersionId) ??
    output.versions[0];
  return active?.outputUrl ?? output.outputUrl;
}

export function PoseSection({
  sourceUrl,
  poseOutputs,
  rowId,
  modelId,
  regeneratingPose,
  onRegeneratePose,
  onRefresh,
}: {
  sourceUrl: string;
  poseOutputs: PoseOutputData[];
  rowId: string;
  modelId: string;
  regeneratingPose: PoseType | null;
  onRegeneratePose: (pose: PoseType) => void;
  onRefresh: () => void;
}) {
  const trpc = useTRPC();

  const setActiveVersion = useMutation(
    trpc.pose.setActivePoseVersion.mutationOptions(),
  );

  const [zoomUrl, setZoomUrl] = useState<string | null>(null);

  const outputByPose = Object.fromEntries(
    poseOutputs.map((o) => [o.poseType, o]),
  ) as Partial<Record<PoseType, PoseOutputData>>;

  const hasSource = Boolean(sourceUrl.trim());

  return (
    <div className="space-y-1">
      <span
        className="text-[10px] text-muted-foreground invisible block select-none"
        aria-hidden
      >
        参考图
      </span>
      {!hasSource && <div className="h-7 shrink-0" aria-hidden />}
      <div className="grid grid-cols-4 gap-1.5">
      {POSE_TYPES.map((pose) => {
        const output = outputByPose[pose];
        const url = displayUrl(output);
        return (
          <div key={pose} className="space-y-0.5">
            {url ? (
              <div className="min-h-28 flex items-center relative group">
                <AdaptiveImage src={url} maxHeightClass="max-h-28" className="w-full" />
                <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-5 w-5 p-0 bg-background/80 hover:bg-background"
                    title="放大查看"
                    onClick={() => setZoomUrl(url)}
                  >
                    <Eye className="size-2.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="h-5 w-5 p-0 bg-background/80 hover:bg-background"
                    disabled={!hasSource || regeneratingPose !== null}
                    title="重新生成"
                    onClick={() => onRegeneratePose(pose)}
                  >
                    {regeneratingPose === pose ? (
                      <RefreshCw className="size-2.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-2.5" />
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="h-28 rounded border border-dashed flex items-center justify-center text-[9px] text-muted-foreground">
                待生成
              </div>
            )}
            {output && output.versions.length > 0 && (
              <div className="flex items-center gap-0.5">
                <History className="size-2.5 text-muted-foreground shrink-0" />
                <Select
                  value={output.activeVersionId ?? output.versions[0]?.id ?? ""}
                  onValueChange={(v) => {
                    if (!v) return;
                    setActiveVersion.mutate(
                      { outputId: output.id, versionId: v },
                      { onSuccess: () => onRefresh() },
                    );
                  }}
                >
                  <SelectTrigger className="h-6 text-[9px] flex-1 min-w-0 px-1">
                    <SelectValue placeholder="历史" />
                  </SelectTrigger>
                  <SelectContent>
                    {output.versions.map((v, i) => (
                      <SelectItem key={v.id} value={v.id}>
                        v{output.versions.length - i} ·{" "}
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
          </div>
        );
      })}
      </div>
      <Dialog open={!!zoomUrl} onOpenChange={(open) => !open && setZoomUrl(null)}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 bg-black/90 border-none">
          {zoomUrl && (
            <img
              src={zoomUrl}
              alt="预览"
              className="max-w-full max-h-[85vh] object-contain mx-auto"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
