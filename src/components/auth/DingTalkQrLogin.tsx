"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    DTFrameLogin?: (
      frameConfig: { id: string; width: number; height: number },
      authConfig: Record<string, string>,
      onSuccess: (result: { authCode: string; redirectUrl?: string }) => void,
      onError: (msg: string) => void,
    ) => void;
  }
}

const SCRIPT_URL =
  "https://g.alicdn.com/dingding/dingtalk-login/0.0.5/ddLogin.js";

export function DingTalkQrLogin() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  const clientId = process.env.NEXT_PUBLIC_AUTH_DINGTALK_ID;
  const redirectUri =
    typeof window !== "undefined"
      ? `${window.location.origin}/login`
      : process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/login`
        : "";

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
    if (!sdkReady || !clientId || !window.DTFrameLogin) {
      return;
    }

    window.DTFrameLogin(
      { id: "dingtalk-qr-container", width: 300, height: 300 },
      {
        redirect_uri: encodeURIComponent(redirectUri),
        client_id: clientId,
        scope: "openid",
        response_type: "code",
        state: crypto.randomUUID(),
        prompt: "consent",
      },
      async (result) => {
        setLoading(true);
        setError(null);
        const res = await signIn("dingtalk-qr", {
          authCode: result.authCode,
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
      (msg) => {
        setError(msg || "扫码登录失败");
      },
    );
  }, [sdkReady, clientId, redirectUri, router]);

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
