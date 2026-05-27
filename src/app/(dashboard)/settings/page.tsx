"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Key, CreditCard, LogOut, User } from "lucide-react";
import { signOut } from "next-auth/react";

export default function SettingsPage() {
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
            <CardDescription>更新你的个人资料</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="size-16">
                <AvatarImage src="" alt="用户头像" />
                <AvatarFallback>U</AvatarFallback>
              </Avatar>
              <Button variant="outline" size="sm">更换头像</Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">名称</Label>
              <Input id="name" placeholder="你的名字" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">邮箱</Label>
              <Input id="email" type="email" placeholder="you@example.com" />
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
              <span className="text-2xl font-bold">100</span>
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

        <Button
          variant="outline"
          className="w-full gap-2 text-destructive hover:text-destructive"
          onClick={() => void signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="size-4" />
          退出登录
        </Button>
      </div>
    </div>
  );
}
