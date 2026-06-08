import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function getAuthUserId(): Promise<string | null> {
  try {
    const session = await auth();
    if (session?.user?.id) return session.user.id;

    const hdrs = await headers();
    const token = await getToken({
      req: { headers: Object.fromEntries(hdrs) } as any,
      secret: process.env.AUTH_SECRET,
    });
    return token?.sub ?? null;
  } catch {
    return null;
  }
}

export async function getIsAdmin(): Promise<boolean> {
  const userId = await getAuthUserId();
  if (!userId) return false;
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const role = user?.role?.toUpperCase();
    return role === "ADMIN" || role === "MANAGER";
  } catch {
    return false;
  }
}

/** 检查用户角色是否为 ADMIN 或 MANAGER（均可访问管理功能和查看全部内容） */
export function isAdminOrManager(role?: string | null): boolean {
  const r = role?.toUpperCase();
  return r === "ADMIN" || r === "MANAGER";
}

