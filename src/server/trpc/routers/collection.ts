import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";
import { TRPCError } from "@trpc/server";

export const collectionRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.collection.findMany({
      where: { userId: ctx.userId },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { assets: true } },
        assets: {
          take: 1,
          orderBy: { addedAt: "desc" },
          include: {
            asset: { select: { thumbnailUrl: true, originalUrl: true } },
          },
        },
      },
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const maxOrder = await db.collection.findFirst({
        where: { userId: ctx.userId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      return db.collection.create({
        data: {
          userId: ctx.userId,
          name: input.name,
          description: input.description,
          sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        coverAsset: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const col = await db.collection.findUnique({
        where: { id: input.collectionId },
      });
      if (!col || col.userId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return db.collection.update({
        where: { id: input.collectionId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.coverAsset !== undefined ? { coverAsset: input.coverAsset } : {}),
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const col = await db.collection.findUnique({
        where: { id: input.collectionId },
      });
      if (!col || col.userId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await db.collection.delete({ where: { id: input.collectionId } });
      return { success: true };
    }),

  addAsset: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        assetId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const col = await db.collection.findUnique({
        where: { id: input.collectionId },
      });
      if (!col || col.userId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const maxOrder = await db.collectionAsset.findFirst({
        where: { collectionId: input.collectionId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });

      return db.collectionAsset.create({
        data: {
          collectionId: input.collectionId,
          assetId: input.assetId,
          sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
        },
      });
    }),

  removeAsset: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        assetId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const col = await db.collection.findUnique({
        where: { id: input.collectionId },
      });
      if (!col || col.userId !== ctx.userId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      await db.collectionAsset.deleteMany({
        where: { collectionId: input.collectionId, assetId: input.assetId },
      });
      return { success: true };
    }),
});
