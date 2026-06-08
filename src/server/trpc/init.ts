import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { GatewayRegistry } from "@/server/ai-gateway/types";
import { db } from "@/lib/db";
import { getAuthUserId } from "@/lib/auth-user";

interface CreateContextOptions {
  headers: Headers;
}

export async function createContext({ headers: _headers }: CreateContextOptions) {
  const userId = await getAuthUserId();
  return {
    userId,
    db,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { disabled: true, role: true },
  });
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (user.disabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "账户已被禁用",
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      userRole: user.role,
    },
  });
});

const enforceAdmin = t.middleware(({ ctx, next }) => {
  const role = (ctx as any).userRole as string | undefined;
  // ADMIN（超管）和 MANAGER（普通管理员）均可访问管理功能
  if (role?.toUpperCase() !== "ADMIN" && role?.toUpperCase() !== "MANAGER") {
    throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
  }
  return next({ ctx });
});

const enforceSuperAdmin = t.middleware(({ ctx, next }) => {
  const role = (ctx as any).userRole as string | undefined;
  if (role?.toUpperCase() !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "需要超级管理员权限" });
  }
  return next({ ctx });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
export const adminProcedure = protectedProcedure.use(enforceAdmin);
export const superAdminProcedure = protectedProcedure.use(enforceSuperAdmin);
