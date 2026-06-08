"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/server/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Key, CreditCard, LogOut, User, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const trpc = useTRPC();
  const { data: session, status } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);

  const creditQuery = useQuery(trpc.credits.balance.queryOptions(undefined, {
    retry: false,
  }));

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut({ callbackUrl: "/login" });
    } catch (e) {
      toast.error("退出登录失败，请重试");
      setLoggingOut(false);
    }
  };

  const user = session?.user;
  const initials = user?.name?.slice(0, 2) ?? user?.email?.slice(0, 2).toUpperCase() ?? "U";

  return (
    <div className="h-full overflow-auto">
      <div className="border-b p-4">
        <h1 className="text-lg font-semibold">设置</h1>
        <p className="text-sm text-muted-foreground">
          管理你的账号与 API 密钥
        </p>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* 个人信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="size-4" />
              个人信息
            </CardTitle>
            <CardDescription>
              {status === "loading"
                ? "加载中..."
                : status === "unauthenticated"
                  ? "未登录，请先登录"
                  : "当前登录账号信息"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarImage src={user?.image ?? ""} alt={user?.name ?? "用户头像"} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{user?.name ?? "—"}</p>
                <p className="text-sm text-muted-foreground">{user?.email ?? "—"}</p>
                {"role" in (user ?? {}) && (user as { role?: string }).role && (
                  <span className="text-xs text-muted-foreground">
                    角色：{(user as { role?: string }).role === "ADMIN" ? "管理员" : "普通用户"}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API 密钥 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="size-4" />
              API 密钥
            </CardTitle>
            <CardDescription>
              配置你自己的 AI 服务商 API 密钥
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "ePhone AI 中转", key: "ephone" },
              { label: "Replicate", key: "replicate" },
              { label: "fal.ai", key: "falai" },
              { label: "OpenAI", key: "openai" },
              { label: "Runway", key: "runway" },
              { label: "Pika", key: "pika" },
              { label: "Kling (OpenRouter)", key: "kling" },
            ].map((provider) => (
              <div key={provider.key} className="grid gap-2">
                <Label>{provider.label} API Key</Label>
                <Input type="password" placeholder={`请输入 ${provider.label} API 密钥`} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 积分 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-4" />
              积分
            </CardTitle>
            <CardDescription>当前余额及消费记录</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-2">
              {creditQuery.isLoading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : creditQuery.isError ? (
                <span className="text-2xl font-bold text-muted-foreground">加载失败</span>
              ) : (
                <span className="text-2xl font-bold">{creditQuery.data?.credits ?? 0}</span>
              )}
              <span className="text-sm text-muted-foreground">剩余积分</span>
            </div>
            <Separator className="my-4" />
            <div className="text-sm text-muted-foreground space-y-2">
              <p>各类型生成消耗积分：</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>图片生成：2-20 积分</li>
                <li>视频生成：25-50 积分</li>
                <li>图片编辑：3-10 积分</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full gap-2 text-destructive hover:text-destructive"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogOut className="size-4" />
            )}
            {loggingOut ? "正在退出..." : "退出登录"}
          </Button>

          {status === "unauthenticated" && (
            <p className="text-xs text-center text-muted-foreground">
              当前未登录，部分功能可能不可用。
              <Button variant="link" size="sm" className="px-1" onClick={() => window.location.href = "/login"}>
                前往登录
              </Button>
            </p>
          )}

          {status === "loading" && (
            <div className="text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                会话加载超时？可能是登录凭据已过期。
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  // 清除所有 cookie 并强制跳转登录页
                  document.cookie.split(";").forEach((c) => {
                    document.cookie = c
                      .replace(/^ +/, "")
                      .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
                  });
                  window.location.href = "/login";
                }}
              >
                强制登出并重新登录
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
