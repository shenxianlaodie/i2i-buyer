"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DingTalkQrLogin } from "@/components/auth/DingTalkQrLogin";

const dingtalkEnabled = !!process.env.NEXT_PUBLIC_AUTH_DINGTALK_ID;

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const [showAdmin, setShowAdmin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdminSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("管理员账号或密码错误");
        return;
      }
      if (!result?.ok) {
        setError("登录失败，请检查 AUTH_SECRET 是否已配置并重启 dev");
        return;
      }
      router.push("/studio");
      router.refresh();
    } catch {
      setError("登录请求失败，请查看终端报错");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center text-center">
              <h1 className="text-2xl font-bold">钉钉扫码登录</h1>
              <p className="text-balance text-muted-foreground">
                请使用钉钉扫描下方二维码登录
              </p>
            </div>

            {dingtalkEnabled ? (
              <DingTalkQrLogin />
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                钉钉登录未配置
              </p>
            )}

            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-primary"
              onClick={() => setShowAdmin((v) => !v)}
            >
              {showAdmin ? "收起管理员登录" : "管理员登录"}
            </button>

            {showAdmin && (
              <form className="flex flex-col gap-4" onSubmit={handleAdminSubmit}>
                {error && (
                  <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="grid gap-2">
                  <Label htmlFor="email">管理员邮箱</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@i2i.studio"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "登录中..." : "登录"}
                </Button>
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
