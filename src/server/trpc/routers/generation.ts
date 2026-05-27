import { z } from "zod";
import { router, protectedProcedure, publicProcedure, adminProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";
import { reserveCredits, refundCredits } from "@/lib/credits";
import { TRPCError } from "@trpc/server";
import { enqueueImage, enqueueVideo } from "@/server/ai-gateway/worker";
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
        duration: z.number().min(5).max(15).optional(),
        seed: z.number().optional(),
        referenceImageUrl: z.string().url().optional(),
        projectId: z.string().optional(),
        source: z.literal(GENERATION_SOURCE_CANVAS).optional(),
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
            seed: input.seed,
            ...(input.source ? { source: input.source } : {}),
          },
          referenceImage: input.referenceImageUrl,
          creditCost: 30,
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
      });
      if (!gen) throw new TRPCError({ code: "NOT_FOUND" });
      return gen;
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
      const items = await db.generation.findMany({
        where: {
          userId: ctx.userId,
          ...(input.type ? { type: input.type } : {}),
          ...(input.status ? { status: input.status } : {}),
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
      return { success: true };
    }),
});
