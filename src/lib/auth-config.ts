import { type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import Credentials from "next-auth/providers/credentials";
import DingtalkProvider from "@/lib/providers/dingtalk";
import {
  exchangeDingtalkToken,
  fetchDingtalkProfile,
  findOrCreateDingtalkUser,
} from "@/lib/dingtalk";
import crypto from "crypto";

function verifyPassword(input: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const inputHash = crypto
    .pbkdf2Sync(input, salt, 1000, 64, "sha512")
    .toString("hex");
  return hash === inputHash;
}

const publicPaths = ["/", "/login"];

const dingtalkConfigured =
  !!process.env.AUTH_DINGTALK_ID && !!process.env.AUTH_DINGTALK_SECRET;

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(db),
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    ...(dingtalkConfigured
      ? [
          DingtalkProvider({
            clientId: process.env.AUTH_DINGTALK_ID!,
            clientSecret: process.env.AUTH_DINGTALK_SECRET!,
          }),
        ]
      : []),
    Credentials({
      id: "dingtalk-qr",
      name: "钉钉扫码",
      credentials: {
        authCode: { label: "AuthCode", type: "text" },
      },
      async authorize(credentials) {
        const authCode = (credentials?.authCode as string | undefined)?.trim();
        if (!authCode) return null;
        try {
          const token = await exchangeDingtalkToken(authCode);
          const profile = await fetchDingtalkProfile(token.accessToken);
          const user = await findOrCreateDingtalkUser(profile);
          if (!user) return null;
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
          };
        } catch {
          return null;
        }
      },
    }),
    Credentials({
      id: "credentials",
      name: "管理员",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)
          ?.trim()
          .toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;
        const user = await db.user.findUnique({
          where: { email },
        });
        if (!user || !user.password) return null;
        if (user.role?.toUpperCase() !== "ADMIN") return null;

        const valid = verifyPassword(password, user.password);
        if (!valid) return null;
        if (user.disabled) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;

      if (pathname.startsWith("/api/auth")) return true;
      if (publicPaths.includes(pathname)) {
        if (pathname === "/login" && isLoggedIn) {
          return Response.redirect(new URL("/studio", request.nextUrl));
        }
        return true;
      }

      const protectedPrefixes = [
        "/studio",
        "/pose",
        "/fusion",
        "/assets",
        "/workflows",
        "/settings",
        "/agent",
      ];
      if (protectedPrefixes.some((p) => pathname.startsWith(p))) {
        return isLoggedIn;
      }

      return true;
    },
    async signIn({ account, user }) {
      if (!user) return false;
      const provider = account?.provider;
      if (
        provider === "credentials" ||
        provider === "dingtalk-qr" ||
        provider === "dingtalk"
      ) {
        return true;
      }
      return false;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        const role = (user as { role?: string }).role;
        if (role) token.role = role.toUpperCase();
      }
      if (token.sub && !token.role) {
        try {
          const dbUser = await db.user.findUnique({
            where: { id: token.sub },
            select: { role: true, disabled: true },
          });
          if (dbUser) {
            token.role = dbUser.role.toUpperCase();
            token.disabled = dbUser.disabled;
          }
        } catch {
          // 数据库不可达时不阻断登录
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        (session.user as { role?: string }).role =
          (token.role as string) ?? "USER";
      }
      return session;
    },
  },
};
