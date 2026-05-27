"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search, Grid3X3, List } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import { GENERATION_SOURCE_CANVAS } from "@/lib/generation-source";

export default function AssetsPage() {
  const trpc = useTRPC();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const assetsQuery = useQuery(
    trpc.assets.list.queryOptions({
      type: "VIDEO",
      source: GENERATION_SOURCE_CANVAS,
      search: search || undefined,
      limit: 50,
    }),
  );
  const assets = assetsQuery.data?.items ?? [];

  return (
    <div className="h-full flex flex-col">
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
        <Badge variant="secondary">仅画板生成视频</Badge>
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
      </div>

      <div className="flex-1 overflow-auto p-4">
        {assetsQuery.isLoading && (
          <p className="text-sm text-muted-foreground">加载中...</p>
        )}
        {assetsQuery.isError && (
          <p className="text-sm text-destructive">
            加载失败：{assetsQuery.error.message}
          </p>
        )}
        {!assetsQuery.isLoading && !assetsQuery.isError && assets.length === 0 && (
          <p className="text-sm text-muted-foreground">
            素材库已清空，仅保留画板生成视频。当前暂无视频。
          </p>
        )}
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
              : "flex flex-col gap-3"
          }
        >
          {assets.map((asset) => (
            <Card
              key={asset.id}
              className={
                viewMode === "grid"
                  ? "group overflow-hidden"
                  : "flex items-center gap-4 p-3"
              }
            >
              <div
                className={
                  viewMode === "grid"
                    ? "aspect-square bg-muted relative overflow-hidden"
                    : "size-16 rounded-md bg-muted shrink-0 overflow-hidden"
                }
              >
                <video
                  src={asset.cdnUrl ?? asset.originalUrl}
                  poster={asset.thumbnailUrl ?? undefined}
                  className="size-full object-cover"
                  controls={viewMode === "list"}
                  muted
                  playsInline
                />
                <Badge className="absolute top-2 left-2 text-xs" variant="secondary">
                  视频
                </Badge>
              </div>
              {viewMode === "list" && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{asset.filename}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {Math.round(asset.duration ?? 0)}s
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(asset.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
