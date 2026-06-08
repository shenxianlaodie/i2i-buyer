"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

export function AuthProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider
      session={session}
      // 已有服务端 session，不需要客户端立即再请求
      refetchOnWindowFocus={false}
      refetchInterval={5 * 60}
    >
      {children}
    </SessionProvider>
  );
}
