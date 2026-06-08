"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Coins, TrendingDown, TrendingUp, RotateCcw, Gift, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const typeConfig: Record<string, { label: string; icon: typeof TrendingDown; color: string }> = {
  CONSUME: { label: "消耗", icon: TrendingDown, color: "text-red-500" },
  GRANT: { label: "赠送", icon: Gift, color: "text-green-500" },
  REFUND: { label: "退款", icon: RotateCcw, color: "text-blue-500" },
  PURCHASE: { label: "购买", icon: TrendingUp, color: "text-emerald-500" },
  BONUS: { label: "奖励", icon: Gift, color: "text-amber-500" },
};

function formatDate(dateStr: string | Date) {
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${month}月${day}日 ${hours}:${minutes}`;
}

export function CreditHistorySheet({
  trigger,
  open,
  onOpenChange,
}: {
  trigger: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.credits.history.queryOptions({ limit: 30 }),
  );

  const items = data?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger} />
      <SheetContent side="right" className="flex flex-col h-full max-h-dvh sm:max-w-sm p-0">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Coins className="size-5" />
            积分明细
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden px-4 pb-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              暂无积分记录
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-1 pr-2">
                {items.map((tx) => {
                  const cfg = typeConfig[tx.type] ?? {
                    label: tx.type,
                    icon: Coins,
                    color: "text-muted-foreground",
                  };
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/50 transition-colors"
                    >
                      <div className={cn("shrink-0", cfg.color)}>
                        <Icon className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">
                          {cfg.label}
                          {tx.description ? ` · ${tx.description}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(tx.createdAt)}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "shrink-0 text-sm font-semibold tabular-nums",
                          tx.amount > 0 ? "text-green-600" : "text-red-500",
                        )}
                      >
                        {tx.amount > 0 ? "+" : ""}
                        {tx.amount}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
