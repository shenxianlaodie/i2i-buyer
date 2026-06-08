"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

/**
 * 钉钉扫码登录组件
 *
 * 直接跳转钉钉 OAuth 授权页面（oauth2/challenge.htm），
 * 该页面在桌面端会展示二维码供用户扫描，扫码后回调至 /studio。
 *
 * 注意：已废弃 ddLogin.js v0.0.5 内嵌 iframe 方案，
 * 因为钉钉已弃用 qrcode.htm 端点，该端点不再接受参数。
 */
export function DingTalkQrLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientId = process.env.NEXT_PUBLIC_AUTH_DINGTALK_ID;

  async function handleLogin() {
    setLoading(true);
    setError(null);
    try {
      await signIn("dingtalk", { callbackUrl: "/studio" });
    } catch {
      setError("登录跳转失败，请重试");
      setLoading(false);
    }
  }

  if (!clientId) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">
          未配置 NEXT_PUBLIC_AUTH_DINGTALK_ID
        </p>
        <p className="text-sm text-muted-foreground">
          请在 .env 中配置钉钉开放平台应用参数后重新构建
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 p-8 text-center">
        <svg
          className="size-12 text-muted-foreground/50"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <rect x="7" y="7" width="10" height="10" />
          <rect x="8.5" y="8.5" width="7" height="7" />
          <rect x="10" y="10" width="4" height="4" />
        </svg>
        <p className="text-sm text-muted-foreground">
          点击下方按钮跳转钉钉授权页面
          <br />
          使用钉钉 App 扫描页面上的二维码即可登录
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
      {loading && (
        <p className="text-sm text-muted-foreground text-center">跳转中...</p>
      )}

      <Button
        className="w-full"
        size="lg"
        disabled={loading}
        onClick={handleLogin}
      >
        {loading ? "跳转中..." : "钉钉扫码登录"}
      </Button>

      <p className="text-xs text-muted-foreground">
        将跳转至钉钉授权页面，使用钉钉 App 扫码即可完成登录
      </p>
    </div>
  );
}
