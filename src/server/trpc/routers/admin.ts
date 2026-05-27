import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, protectedProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";
import { grantCredits, setUserCredits } from "@/lib/credits";
import {
  getPromptSettings,
  savePromptSettings,
  getModelSettings,
  saveModelSettings,
} from "@/lib/system-settings";
import { POSE_TYPES } from "@/lib/pose-types";

export const adminRouter = router({
  isAdmin: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { role: true },
    });
    return { isAdmin: user?.role?.toUpperCase() === "ADMIN" };
  }),

  listUsers: adminProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const search = input?.search?.trim();
      const users = await db.user.findMany({
        where: search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: { createdAt: "desc" },
        take: input?.limit ?? 50,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          disabled: true,
          credits: true,
          createdAt: true,
          _count: {
            select: {
              generations: true,
              fusionBatches: true,
              poseBatches: true,
            },
          },
        },
      });
      return users;
    }),

  setUserDisabled: adminProcedure
    .input(z.object({ userId: z.string(), disabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId && input.disabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "不能禁用当前登录账户",
        });
      }
      return db.user.update({
        where: { id: input.userId },
        data: { disabled: input.disabled },
        select: { id: true, disabled: true },
      });
    }),

  grantCredits: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        amount: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input }) => {
      const balance = await grantCredits(
        input.userId,
        input.amount,
        "管理员发放配额",
      );
      return { balance };
    }),

  setCredits: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        credits: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input }) => {
      const balance = await setUserCredits(
        input.userId,
        input.credits,
        "管理员设置配额",
      );
      return { balance };
    }),

  getUserUsage: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          name: true,
          credits: true,
          createdAt: true,
        },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const [
        generationStats,
        creditConsumed,
        recentTransactions,
        fusionCount,
        poseCount,
      ] = await Promise.all([
        db.generation.groupBy({
          by: ["status"],
          where: { userId: input.userId },
          _count: true,
        }),
        db.creditTransaction.aggregate({
          where: { userId: input.userId, type: "CONSUME" },
          _sum: { amount: true },
        }),
        db.creditTransaction.findMany({
          where: { userId: input.userId },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        db.fusionBatch.count({ where: { userId: input.userId } }),
        db.poseBatch.count({ where: { userId: input.userId } }),
      ]);

      return {
        user,
        generationStats,
        totalConsumed: Math.abs(creditConsumed._sum.amount ?? 0),
        fusionBatchCount: fusionCount,
        poseBatchCount: poseCount,
        recentTransactions,
      };
    }),

  getUserTasks: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const [fusionBatches, poseBatches, activeGenerations] =
        await Promise.all([
          db.fusionBatch.findMany({
            where: { userId: input.userId },
            orderBy: { updatedAt: "desc" },
            take: 10,
            include: { _count: { select: { rows: true } } },
          }),
          db.poseBatch.findMany({
            where: { userId: input.userId },
            orderBy: { updatedAt: "desc" },
            take: 10,
            include: { _count: { select: { rows: true } } },
          }),
          db.generation.findMany({
            where: {
              userId: input.userId,
              status: { in: ["PENDING", "QUEUED", "PROCESSING"] },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              type: true,
              status: true,
              prompt: true,
              poseType: true,
              fusionBatchId: true,
              poseBatchId: true,
              createdAt: true,
            },
          }),
        ]);

      return { fusionBatches, poseBatches, activeGenerations };
    }),

  getPromptSettings: adminProcedure.query(async () => getPromptSettings()),

  updatePromptSettings: adminProcedure
    .input(
      z.object({
        pose: z.record(z.enum(POSE_TYPES), z.string().min(1)),
        productTitle: z.string().min(1),
        productDescription: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      await savePromptSettings(input);
      return { success: true };
    }),

  getModelSettings: protectedProcedure.query(async () => getModelSettings()),

  updateModelSettings: adminProcedure
    .input(
      z.object({
        imageModelId: z.string().min(1),
        videoModelId: z.string().min(1),
        textModelId: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      await saveModelSettings(input);
      return { success: true };
    }),
});
