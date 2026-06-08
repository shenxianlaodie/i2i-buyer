"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BlurhashImage } from "@/components/ui/blurhash-image";
import { toast } from "sonner";
import { Trash2, RotateCcw, Loader2, Image } from "lucide-react";

export default function TrashPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    ...trpc.trash.list.queryOptions({ limit: 50 }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const restoreMut = useMutation(
    trpc.trash.restore.mutationOptions({
      onSuccess: () => { toast.success("已恢复"); qc.invalidateQueries(trpc.trash.list.queryFilter({ limit: 50 })); },
      onError: (e) => toast.error(e.message),
    }),
  );

  const deleteMut = useMutation(
    trpc.trash.permanentDelete.mutationOptions({
      onSuccess: () => { toast.success("已永久删除"); qc.invalidateQueries(trpc.trash.list.queryFilter({ limit: 50 })); },
      onError: (e) => toast.error(e.message),
    }),
  );

  const items = data?.items ?? [];
  const now = Date.now();

  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-4">
        <h1 className="text-lg font-semibold">回收站</h1>
        <p className="text-sm text-muted-foreground">3天后自动清理 · 恢复后不重置计时</p>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center"><Trash2 className="size-12 mx-auto text-muted-foreground/30 mb-4" /><p className="text-sm text-muted-foreground">回收站为空</p></div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {items.map((item) => {
              const deletedTime = item.trashedAt ? new Date(item.trashedAt).getTime() : now;
              const daysLeft = Math.max(0, Math.ceil(3 - (now - deletedTime) / 86400000));
              return (
                <Card key={item.id} className="overflow-hidden">
                  <div className="aspect-square bg-muted relative">
                    {item.ossThumbUrl ? <BlurhashImage src={item.ossThumbUrl} alt="" className="size-full object-cover" /> : <div className="size-full flex items-center justify-center"><Image className="size-8 text-muted-foreground/30" /></div>}
                    <Badge className="absolute top-2 left-2 text-xs" variant="secondary">{item.type === "VIDEO" ? "视频" : "图片"}</Badge>
                    <Badge className="absolute top-2 right-2 text-xs" variant={daysLeft <= 1 ? "destructive" : "outline"}>{daysLeft}天后清理</Badge>
                  </div>
                  <div className="p-2">
                    <p className="text-xs text-muted-foreground line-clamp-1">{item.user?.name ?? ""}</p>
                    <p className="text-[10px] text-muted-foreground">删除于 {item.trashedAt ? new Date(item.trashedAt).toLocaleString("zh-CN",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}) : ""}</p>
                    <div className="flex items-center gap-1 mt-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => restoreMut.mutate({ id: item.id })}><RotateCcw className="size-3 mr-1" />恢复</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => deleteMut.mutate({ id: item.id })}><Trash2 className="size-3" /></Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
