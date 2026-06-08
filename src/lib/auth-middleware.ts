/**
 * 中间件专用 NextAuth 实例
 * 不导入任何 Node.js 模块（Prisma、crypto、db 等）
 * 只做路由守卫，与 auth.ts 共用同一个 AUTH_SECRET
 */
import NextAuth from "next-auth";

export const { auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // 空数组，中间件不需要 provider
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/api/")) return true;

      const isLoggedIn = !!(auth?.user?.email || auth?.user?.name);
      const publicPaths = ["/", "/login"];
      const protectedPrefixes = [
        "/studio", "/pose", "/fusion", "/assets",
        "/workflows", "/settings", "/agent",
      ];

      if (publicPaths.includes(pathname)) {
        if (pathname === "/login" && isLoggedIn) {
          return Response.redirect(new URL("/studio", request.nextUrl));
        }
        return true;
      }
      if (protectedPrefixes.some((p) => pathname.startsWith(p))) {
        return isLoggedIn;
      }
      return true;
    },
  },
});
