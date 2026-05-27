import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { GENERATION_SOURCE_CANVAS } from "@/lib/generation-source";

export const assetRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        type: z.enum(["IMAGE", "VIDEO"]).optional(),
        source: z.enum([GENERATION_SOURCE_CANVAS]).optional(),
        collectionId: z.string().optional(),
        search: z.string().optional(),
        favorite: z.boolean().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { userId: ctx.userId };
      if (input.type) where.type = input.type;
      if (input.favorite) where.isFavorite = true;
      if (input.search) {
        where.OR = [
          { filename: { contains: input.search, mode: "insensitive" } },
          {
            generation: {
              is: { prompt: { contains: input.search, mode: "insensitive" } },
            },
          },
        ];
      }
      if (input.collectionId) {
        where.collections = { some: { collectionId: input.collectionId } };
      }
      if (input.source === GENERATION_SOURCE_CANVAS) {
        where.generation = {
          is: {
            params: {
              path: ["source"],
              equals: GENERATION_SOURCE_CANVAS,
            },
          },
        };
      }

      const items = await db.asset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: { collections: { select: { collectionId: true } } },
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),

  get: protectedProcedure
    .input(z.object({ assetId: z.string() }))
    .query(async ({ ctx, input }) => {
      const asset = await db.asset.findUnique({
        where: { id: input.assetId, userId: ctx.userId },
        include: { generation: true, collections: true },
      });
      if (!asset) throw new TRPCError({ code: "NOT_FOUND" });
      return asset;
    }),

  toggleFavorite: protectedProcedure
    .input(z.object({ assetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const asset = await db.asset.findUnique({
        where: { id: input.assetId, userId: ctx.userId },
      });
      if (!asset) throw new TRPCError({ code: "NOT_FOUND" });

      return db.asset.update({
        where: { id: input.assetId },
        data: { isFavorite: !asset.isFavorite },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ assetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const asset = await db.asset.findUnique({
        where: { id: input.assetId, userId: ctx.userId },
      });
      if (!asset) throw new TRPCError({ code: "NOT_FOUND" });

      await db.asset.delete({ where: { id: input.assetId } });
      return { success: true };
    }),
});
