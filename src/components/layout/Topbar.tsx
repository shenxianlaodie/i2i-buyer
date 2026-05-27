"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Coins, LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

export function Topbar() {
  const router = useRouter();
  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b bg-background px-4 lg:px-6">
      <div className="flex lg:hidden items-center gap-2 font-semibold text-sm">
        i2i Studio
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 text-sm">
          <Coins className="size-4" />
          <span className="font-medium">100</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full size-8 [&>button]:size-full">
            <Button variant="ghost" size="icon" className="rounded-full size-8">
              <Avatar className="size-8">
                <AvatarImage src="" alt="User" />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
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
    </header>
  );
}
