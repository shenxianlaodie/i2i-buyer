"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { useTRPC } from "@/server/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreditHistorySheet } from "@/components/ui/credit-history-sheet";
import {
  Play,
  Image,
  Shield,
  MessageSquare,
  Settings,
  Layers,
  Users,
  Coins,
  LogOut,
  Trash2,
} from "lucide-react";

const baseNavItems = [
  { href: "/studio", label: "画板", icon: Play },
  { href: "/fusion", label: "融合图", icon: Layers },
  { href: "/pose", label: "多姿势", icon: Users },
  { href: "/assets", label: "素材", icon: Image },
  { href: "/trash", label: "回收站", icon: Trash2 },
  { href: "/agent", label: "AI 助手", icon: MessageSquare },
  { href: "/settings", label: "设置", icon: Settings },
];

const adminNavItem = {
  href: "/workflows",
  label: "管理",
  icon: Shield,
};

export function MobileNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const trpc = useTRPC();
  const { data: session } = useSession();
  const [creditSheetOpen, setCreditSheetOpen] = useState(false);

  const creditQuery = useQuery(trpc.credits.balance.queryOptions(undefined, { retry: false }));
  const credits = creditQuery.data?.credits ?? 0;
  const userName = session?.user?.name ?? session?.user?.email?.split("@")[0] ?? "用户";
  const userInitials = session?.user?.name?.slice(0, 2) ?? session?.user?.email?.slice(0, 2).toUpperCase() ?? "U";

  const navItems = isAdmin
    ? [
        ...baseNavItems.slice(0, 4),
        adminNavItem,
        ...baseNavItems.slice(4),
      ]
    : baseNavItems;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background">
      <div className="flex items-center h-14 px-2">
        {/* 左侧：积分 + 用户 */}
        <div className="flex items-center gap-0.5 shrink-0">
          <CreditHistorySheet
            open={creditSheetOpen}
            onOpenChange={setCreditSheetOpen}
            trigger={
              <Button variant="ghost" size="sm" className="gap-1 text-xs h-8 px-1.5">
                <Coins className="size-3.5" />
                <span className="font-medium tabular-nums">{credits}</span>
              </Button>
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 rounded-full [&>button]:rounded-full">
              <Button variant="ghost" size="icon" className="rounded-full size-8">
                <Avatar className="size-7">
                  <AvatarImage src={session?.user?.image ?? ""} alt={userName} />
                  <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
                </Avatar>
              </Button>
              <span className="text-[10px] font-medium text-muted-foreground max-w-[56px] truncate">
                {userName}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-40 mb-2">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => router.push("/settings")}
              >
                <Settings className="size-4" />
                设置
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                className="cursor-pointer"
                onClick={() => void signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="size-4" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 中间：导航项 */}
        <div className="flex-1 flex items-center justify-center gap-0.5 overflow-x-auto">
          {navItems.slice(0, 5).map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-12 shrink-0 flex-col items-center gap-0.5 px-1.5 py-1 text-[11px] transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* 右侧占位保持居中 */}
        <div className="shrink-0 w-[72px]" />
      </div>
    </nav>
  );
}
