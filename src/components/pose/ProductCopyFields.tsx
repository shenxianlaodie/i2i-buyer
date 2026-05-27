"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Copy, Loader2, Sparkles } from "lucide-react";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function ProductCopyFields({
  rowId,
  sourceUrl,
  productTitle,
  productDescription,
  onTitleChange,
  onDescriptionChange,
  onSaveTitle,
  onSaveDescription,
  onGenerated,
}: {
  rowId: string;
  sourceUrl: string;
  productTitle: string;
  productDescription: string;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onSaveTitle: () => void;
  onSaveDescription: () => void;
  onGenerated: (title: string, description: string) => void;
}) {
  const trpc = useTRPC();
  const [copying, setCopying] = useState<"title" | "description" | null>(null);

  const generate = useMutation(
    trpc.pose.generateProductCopy.mutationOptions({
      onSuccess: (data) => {
        onTitleChange(data.productTitle);
        onDescriptionChange(data.productDescription);
        onGenerated(data.productTitle, data.productDescription);
        toast.success("已生成商品文案");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const translate = useMutation(
    trpc.pose.translateProductCopy.mutationOptions({
      onError: (e) => toast.error(e.message),
    }),
  );

  const handleCopyEn = async (kind: "title" | "description") => {
    const text = kind === "title" ? productTitle : productDescription;
    if (!text.trim()) {
      toast.error("内容为空");
      return;
    }
    setCopying(kind);
    try {
      const { english } = await translate.mutateAsync({ text });
      await copyText(english);
      toast.success("已复制英文");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "翻译失败");
    } finally {
      setCopying(null);
    }
  };

  const busy = generate.isPending || translate.isPending;

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 w-full text-[10px] gap-1"
        disabled={!sourceUrl.trim() || busy}
        onClick={() =>
          generate.mutate({
            rowId,
            sourceImageUrl: sourceUrl,
            fields: "both",
          })
        }
      >
        {generate.isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Sparkles className="size-3" />
        )}
        一键生成
      </Button>

      <div>
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-[10px] text-muted-foreground">商品标题</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[9px] gap-0.5"
            disabled={!productTitle.trim() || busy}
            onClick={() => void handleCopyEn("title")}
          >
            {copying === "title" ? (
              <Loader2 className="size-2.5 animate-spin" />
            ) : (
              <Copy className="size-2.5" />
            )}
            复制英文
          </Button>
        </div>
        <Input
          value={productTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          onBlur={onSaveTitle}
          className="h-8 text-xs"
          placeholder="生成或手动输入"
        />
      </div>

      <div>
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-[10px] text-muted-foreground">商品描述</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[9px] gap-0.5"
            disabled={!productDescription.trim() || busy}
            onClick={() => void handleCopyEn("description")}
          >
            {copying === "description" ? (
              <Loader2 className="size-2.5 animate-spin" />
            ) : (
              <Copy className="size-2.5" />
            )}
            复制英文
          </Button>
        </div>
        <Textarea
          value={productDescription}
          onChange={(e) => onDescriptionChange(e.target.value)}
          onBlur={onSaveDescription}
          className="min-h-[72px] text-xs"
          placeholder="生成或手动输入"
        />
      </div>
    </div>
  );
}
