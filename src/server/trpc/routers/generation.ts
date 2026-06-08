import { z } from "zod";
import { router, protectedProcedure, publicProcedure, adminProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";
import { reserveCredits, refundCredits } from "@/lib/credits";
import { TRPCError } from "@trpc/server";
import { enqueueImage, enqueueVideo, getWorkerStats, getImageQueuePosition, getVideoQueuePosition, cancelImageGeneration, cancelVideoGeneration } from "@/server/ai-gateway/worker";
import { GENERATION_SOURCE_CANVAS } from "@/lib/generation-source";

const aspectRatioEnum = z.enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"]);
const providerEnum = z.enum([
  "ephone",
  "replicate",
  "falai",
  "openai",
  "runway",
  "pika",
  "kling",
  "tuzi",
]);
const generationTypeEnum = z.enum(["IMAGE", "VIDEO"]);
const generationStatusEnum = z.enum(["PENDING", "QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"]);

export const generationRouter = router({
  createImage: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(4000),
        negativePrompt: z.string().max(4000).optional(),
        modelId: z.string(),
        provider: providerEnum,
        aspectRatio: aspectRatioEnum.optional(),
        numOutputs: z.number().min(1).max(4).optional(),
        seed: z.number().optional(),
        guidanceScale: z.number().min(0).max(20).optional(),
        steps: z.number().min(1).max(50).optional(),
        referenceImageUrl: z.string().url().optional(),
        strength: z.number().min(0).max(1).optional(),
        projectId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const generation = await db.generation.create({
        data: {
          userId: ctx.userId,
          projectId: input.projectId,
          type: "IMAGE",
          provider: input.provider.toUpperCase(),
          modelId: input.modelId,
          status: "PENDING",
          prompt: input.prompt,
          negativePrompt: input.negativePrompt,
          params: {
            aspectRatio: input.aspectRatio,
            numOutputs: input.numOutputs,
            seed: input.seed,
            guidanceScale: input.guidanceScale,
            steps: input.steps,
            strength: input.strength,
          },
          referenceImage: input.referenceImageUrl,
          creditCost: 5,
        },
      });

      // 立即创建占位 Asset，素材库/画板可 0ms 看到"生成中"占位
      await db.asset.create({
        data: {
          userId: ctx.userId,
          projectId: input.projectId,
          generationId: generation.id,
          type: "IMAGE",
          filename: `gen-${generation.id}.png`,
          originalUrl: input.referenceImageUrl ?? "",
          mimeType: "image/png",
          generationStatus: "QUEUED",
        },
      });

      await reserveCredits(ctx.userId, generation.id, input.modelId);
      enqueueImage(generation.id);
      return { generationId: generation.id };
    }),

  createVideo: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1).max(4000),
        negativePrompt: z.string().max(4000).optional(),
        modelId: z.string(),
        provider: providerEnum,
        aspectRatio: aspectRatioEnum.optional(),
        duration: z.number().min(1).max(25).optional(),
        /** Sora-2 视频尺寸，如 "1280x720" */
        videoSize: z.string().optional(),
        seed: z.number().optional(),
        referenceImageUrl: z.string().url().optional(),
        projectId: z.string().optional(),
        source: z.literal(GENERATION_SOURCE_CANVAS).optional(),
        mode: z.enum(["std", "pro", "4k"]).optional(),
        sound: z.enum(["on", "off"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const generation = await db.generation.create({
        data: {
          userId: ctx.userId,
          projectId: input.projectId,
          type: "VIDEO",
          provider: input.provider.toUpperCase(),
          modelId: input.modelId,
          status: "PENDING",
          prompt: input.prompt,
          negativePrompt: input.negativePrompt,
          params: {
            aspectRatio: input.aspectRatio,
            duration: input.duration,
            size: input.videoSize,
            seed: input.seed,
            mode: input.mode,
            sound: input.sound,
            ...(input.source ? { source: input.source } : {}),
          },
          referenceImage: input.referenceImageUrl,
          creditCost: 30,
        },
      });

      // 立即创建占位 Asset，素材库/画板可 0ms 看到"生成中"占位
      await db.asset.create({
        data: {
          userId: ctx.userId,
          projectId: input.projectId,
          generationId: generation.id,
          type: "VIDEO",
          filename: `gen-${generation.id}.mp4`,
          originalUrl: input.referenceImageUrl ?? "",
          mimeType: "video/mp4",
          generationStatus: "GENERATING",
        },
      });

      await reserveCredits(ctx.userId, generation.id, input.modelId);
      enqueueVideo(generation.id);
      return { generationId: generation.id };
    }),

  getStatus: protectedProcedure
    .input(z.object({ generationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const gen = await db.generation.findUnique({
        where: { id: input.generationId, userId: ctx.userId },
        select: {
          id: true, status: true, type: true, outputUrls: true,
          errorMessage: true, duration: true, outputData: true,
          startedAt: true, completedAt: true, createdAt: true,
        },
      });
      if (!gen) throw new TRPCError({ code: "NOT_FOUND" });
      return gen;
    }),

  /** 获取所有活跃任务（跨页面轮询用） */
  getActiveTasks: protectedProcedure
    .query(async ({ ctx }) => {
      return db.generation.findMany({
        where: {
          userId: ctx.userId,
          status: { in: ["PENDING", "QUEUED", "PROCESSING"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, status: true, type: true, modelId: true,
          createdAt: true, startedAt: true, completedAt: true,
          prompt: true, errorMessage: true,
          fusionRowId: true, fusionBatchId: true,
          poseRowId: true, poseBatchId: true,
        },
      });
    }),

  /** 查询队列状态 + 指定生成的排队位置（区分图片/视频队列） */
  getQueueStats: protectedProcedure
    .input(z.object({ generationId: z.string().optional(), type: z.enum(["IMAGE", "VIDEO"]).optional() }))
    .query(async ({ input }) => {
      const stats = getWorkerStats();
      const position = input.generationId
        ? input.type === "VIDEO"
          ? getVideoQueuePosition(input.generationId)
          : getImageQueuePosition(input.generationId)
        : -1;
      return { ...stats, position };
    }),

  /** 取消排队中的生成任务 */
  cancelGeneration: protectedProcedure
    .input(z.object({ generationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const gen = await db.generation.findUnique({
        where: { id: input.generationId },
        select: { id: true, userId: true, status: true, type: true },
      });
      if (!gen) throw new TRPCError({ code: "NOT_FOUND" });
      if (gen.userId !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" });
      if (gen.status !== "QUEUED" && gen.status !== "PENDING") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "只能取消排队中的任务" });
      }
      const ok = gen.type === "VIDEO"
        ? await cancelVideoGeneration(input.generationId)
        : await cancelImageGeneration(input.generationId);
      if (!ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "任务已开始处理，无法取消" });
      }
      return { cancelled: true };
    }),

  listRecent: protectedProcedure
    .input(
      z.object({
        type: generationTypeEnum.optional(),
        status: generationStatusEnum.optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const isAdmin = (ctx as any).userRole?.toUpperCase() === "ADMIN";
      const items = await db.generation.findMany({
        where: {
          ...(isAdmin ? {} : { userId: ctx.userId }),
          ...(input.type ? { type: input.type } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        select: {
          id: true,
          type: true,
          outputUrls: true,
          prompt: true,
          createdAt: true,
          userId: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),

  listAll: adminProcedure
    .input(
      z.object({
        type: generationTypeEnum.optional(),
        status: generationStatusEnum.optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input }) => {
      const items = await db.generation.findMany({
        where: {
          ...(input.type ? { type: input.type } : {}),
          ...(input.status ? { status: input.status } : { status: "COMPLETED" }),
        },
        select: {
          id: true,
          type: true,
          outputUrls: true,
          prompt: true,
          createdAt: true,
          userId: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),

  cancel: protectedProcedure
    .input(z.object({ generationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const gen = await db.generation.findUnique({
        where: { id: input.generationId, userId: ctx.userId },
      });
      if (!gen) throw new TRPCError({ code: "NOT_FOUND" });
      if (gen.status === "COMPLETED" || gen.status === "FAILED") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cannot cancel completed generation" });
      }

      await db.generation.update({
        where: { id: input.generationId },
        data: { status: "CANCELLED" },
      });

      await refundCredits(ctx.userId, input.generationId);

      // 同步更新占位 Asset 状态
      await db.asset.updateMany({
        where: { generationId: input.generationId, generationStatus: "GENERATING" },
        data: { generationStatus: "FAILED" },
      });

      return { success: true };
    }),

  /** 清理卡住的生成任务（可由定时任务调用）。
   *  将超过 timeoutMinutes 分钟仍在 GENERATING 的 Asset 标记为 FAILED，
   *  并取消对应的 Generation 记录。 */
  cleanupStuck: protectedProcedure
    .input(z.object({ timeoutMinutes: z.number().min(1).max(60).default(10) }))
    .mutation(async ({ ctx, input }) => {
      const cutoff = new Date(Date.now() - input.timeoutMinutes * 60 * 1000);

      // 找到超过阈值的卡住占位 Asset
      const stuckAssets = await db.asset.findMany({
        where: {
          userId: ctx.userId,
          generationStatus: "GENERATING",
          createdAt: { lt: cutoff },
        },
        select: { id: true, generationId: true },
      });

      let cleaned = 0;
      for (const asset of stuckAssets) {
        // 标记 Asset 为 FAILED
        await db.asset.update({
          where: { id: asset.id },
          data: { generationStatus: "FAILED" },
        });

        // 取消对应的 Generation 记录
        if (asset.generationId) {
          const gen = await db.generation.findUnique({
            where: { id: asset.generationId },
            select: { id: true, status: true },
          });
          if (gen && gen.status !== "COMPLETED" && gen.status !== "FAILED") {
            await db.generation.update({
              where: { id: asset.generationId },
              data: { status: "FAILED", errorMessage: "生成超时自动取消", completedAt: new Date() },
            });
            await refundCredits(ctx.userId, asset.generationId).catch(() => {});
          }
        }
        cleaned++;
      }

      return { cleaned };
    }),
});
