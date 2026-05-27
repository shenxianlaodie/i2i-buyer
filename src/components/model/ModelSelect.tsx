"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useModelStore } from "@/store/model-store";
import { Loader2 } from "lucide-react";
import type { EphoneModel } from "@/server/ai-gateway/ephone/models";

async function fetchModels(category: "image" | "video"): Promise<EphoneModel[]> {
  const res = await fetch(`/api/ephone/models?category=${category}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : `HTTP ${res.status}`,
    );
  }
  return body as EphoneModel[];
}

export function ModelSelect({
  type,
  label,
  className,
}: {
  type: "image" | "video";
  label?: string;
  className?: string;
}) {
  const imageModelId = useModelStore((s) => s.imageModelId);
  const videoModelId = useModelStore((s) => s.videoModelId);
  const setImageModel = useModelStore((s) => s.setImageModel);
  const setVideoModel = useModelStore((s) => s.setVideoModel);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["ephone-models", type],
    queryFn: () => fetchModels(type),
    staleTime: 5 * 60 * 1000,
  });

  const selected = type === "image" ? imageModelId : videoModelId;
  const setSelected = type === "image" ? setImageModel : setVideoModel;

  useEffect(() => {
    if (!data?.length) return;
    const exists = data.some((m) => m.id === selected);
    if (!selected || !exists) {
      setSelected(data[0].id);
    }
  }, [data, selected, setSelected]);

  if (isLoading) {
    return (
      <div className={className}>
        {label && (
          <span className="text-xs text-muted-foreground mr-2">{label}</span>
        )}
        <Loader2 className="size-4 animate-spin inline" />
      </div>
    );
  }

  if (isError || !data?.length) {
    return (
      <div className={className}>
        {label && (
          <span className="text-xs text-muted-foreground mr-2">{label}</span>
        )}
        <span className="text-xs text-destructive">
          {isError && error instanceof Error
            ? error.message
            : "无法加载模型"}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      {label && (
        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      )}
      <Select value={selected ?? ""} onValueChange={(v) => v && setSelected(v)}>
        <SelectTrigger className="h-8 min-w-[200px] text-xs">
          <SelectValue placeholder="选择模型" />
        </SelectTrigger>
        <SelectContent>
          {data.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
