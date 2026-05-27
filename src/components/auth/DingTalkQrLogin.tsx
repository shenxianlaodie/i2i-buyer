"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    DDLogin?: (config: {
      id: string;
      goto: string;
      width?: string;
      height?: string;
      style?: string;
      href?: string;
      appid?: string;
    }) => void;
  }
}

const SCRIPT_URL =
  "https://g.alicdn.com/dingding/dinglogin/0.0.5/ddLogin.js";

export function DingTalkQrLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_AUTH_DINGTALK_ID;
  const gotoUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/login`
      : "";

  const handleAuthCode = useCallback(
    async (authCode: string) => {
      setLoading(true);
      setError(null);
      const res = await signIn("dingtalk-qr", {
        authCode,
        redirect: false,
      });
      if (res?.error) {
        setError("钉钉登录失败，请重试");
        setLoading(false);
        return;
      }
      router.push("/studio");
      router.refresh();
    },
    [router],
  );

  // Handle authCode from URL (after DingTalk redirect)
  useEffect(() => {
    const code = searchParams.get("code");
    if (code && !loading) {
      handleAuthCode(code);
    }
  }, [searchParams, handleAuthCode, loading]);

  // Load SDK and render QR
  useEffect(() => {
    if (!clientId) return;

    const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
    if (existing) {
      setSdkReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setError("钉钉登录组件加载失败");
    document.body.appendChild(script);
  }, [clientId]);

  useEffect(() => {
    if (!sdkReady || !clientId || !window.DDLogin) return;

    const container = document.getElementById("dingtalk-qr-container");
    if (container && container.children.length > 0) return;

    window.DDLogin({
      id: "dingtalk-qr-container",
      goto: encodeURIComponent(gotoUrl),
      width: "300",
      height: "300",
      appid: clientId,
    });
  }, [sdkReady, clientId, gotoUrl]);

  async function handleRedirectLogin() {
    setLoading(true);
    setError(null);
    await signIn("dingtalk", { callbackUrl: "/studio" });
  }

  if (!clientId) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">
          未配置 NEXT_PUBLIC_AUTH_DINGTALK_ID
        </p>
        <Button className="w-full" onClick={handleRedirectLogin} disabled={loading}>
          跳转钉钉登录
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div id="dingtalk-qr-container" className="min-h-[300px] min-w-[300px]" />
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
      {loading && (
        <p className="text-sm text-muted-foreground text-center">登录中...</p>
      )}
      <Button
        variant="outline"
        className="w-full"
        type="button"
        disabled={loading}
        onClick={handleRedirectLogin}
      >
        {loading ? "登录中..." : "使用钉钉网页授权登录"}
      </Button>
    </div>
  );
}
