import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function getAuthUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;

  const hdrs = await headers();
  const token = await getToken({
    req: { headers: Object.fromEntries(hdrs) },
    secret: process.env.AUTH_SECRET,
  });
  return token?.sub ?? null;
}

export async function getIsAdmin(): Promise<boolean> {
  const userId = await getAuthUserId();
  if (!userId) return false;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role?.toUpperCase() === "ADMIN";
}
