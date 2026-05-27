"use client";

import { useTRPC } from "@/server/trpc/client";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Trash2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function TrashGrid() {
  const trpc = useTRPC();

  const { data, isLoading, isError, error, refetch } = useQuery(
    trpc.canvas.listTrashed.queryOptions(),
  );

  const permanentDelete = useMutation(
    trpc.canvas.permanentDelete.mutationOptions({
      onSuccess: () => {
        toast.success("已永久删除");
        refetch();
      },
      onError: (e) => toast.error(e.message ?? "删除失败"),
    }),
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        <Loader2 className="mr-2 size-5 animate-spin" />
        <span>加载中...</span>
      </div>
    );
  }

  if (isError) {
    const isForbidden =
      (error as { data?: { code?: string } })?.data?.code === "FORBIDDEN";
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <AlertCircle className="mb-2 size-8 text-zinc-600" />
        <p className="text-sm">
          {isForbidden
            ? "仅管理员可查看回收站内容"
            : "加载回收站失败，请稍后重试"}
        </p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
        <Trash2 className="mb-2 size-8 text-zinc-600" />
        <p className="text-sm">回收站为空</p>
      </div>
    );
  }

  return (
    <div className="columns-2 gap-3 p-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
      {data.map((item) => (
        <div key={item.id} className="mb-3 break-inside-avoid">
          <div className="group relative w-full overflow-hidden rounded-lg bg-zinc-900">
            <div className="relative aspect-[4/5] w-full">
              {item.type === "VIDEO" ? (
                <video
                  src={item.url}
                  className="size-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  src={item.url}
                  alt={item.prompt}
                  className="size-full object-cover"
                  loading="lazy"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                <div className="absolute top-2 right-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "确定要永久删除该项？此操作不可恢复。",
                        )
                      ) {
                        permanentDelete.mutate({ id: item.id });
                      }
                    }}
                    className="flex size-7 items-center justify-center rounded-full bg-red-500/80 text-white hover:bg-red-500"
                    title="永久删除"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="absolute bottom-0 inset-x-0 space-y-0.5 px-3 py-2">
                  <p className="truncate text-xs text-white/90">
                    {item.prompt}
                  </p>
                  <p className="text-[10px] text-zinc-400">
                    删除者: {item.user.name ?? item.user.email ?? "未知"}
                  </p>
                  <p className="text-[10px] text-zinc-500">
                    {new Date(item.trashedAt).toLocaleString("zh-CN")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
