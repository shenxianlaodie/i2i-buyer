import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { GENERATION_SOURCE_CANVAS } from "@/lib/generation-source";
import { isAdminOrManager } from "@/lib/auth-user";

export const assetRouter = router({
  // 素材库 & 画板：管理员可查看全部并可筛选用户，普通用户只看自己的
  listAll: protectedProcedure
    .input(
      z.object({
        type: z.enum(["IMAGE", "VIDEO"]).optional(),
        search: z.string().optional(),
        favorite: z.boolean().optional(),
        collectionId: z.string().optional(),
        userId: z.string().optional(), // 管理员可按用户筛选
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      const isAdmin = (ctx as any).userRole?.toUpperCase() === "ADMIN";
      const where: Record<string, unknown> = { isDeleted: false };

      // 权限：非管理员只能看自己的作品
      if (!isAdmin) {
        where.userId = ctx.userId;
      } else if (input.userId) {
        where.userId = input.userId;
      }

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

      const items = await db.asset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          type: true,
          filename: true,
          originalUrl: true,
          cdnUrl: true,
          thumbnailUrl: true,
          urlThumb: true,
          urlPreview: true,
          blurHash: true,
          width: true,
          height: true,
          isFavorite: true,
          generationStatus: true,
          generationId: true,
          createdAt: true,
          updatedAt: true,
          mimeType: true,
          generation: { select: { prompt: true, type: true } },
          user: { select: { id: true, name: true, email: true } },
          collections: { select: { collectionId: true } },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),

  // 仅查看自己的素材（用于管理操作）
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
      const where: Record<string, unknown> = { userId: ctx.userId, isDeleted: false };
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
      // 已登录用户可查看任意素材详情（非仅自己的）
      const asset = await db.asset.findUnique({
        where: { id: input.assetId },
        include: {
          generation: { select: { id: true, prompt: true, provider: true, modelId: true } },
          user: { select: { id: true, name: true, email: true } },
          collections: true,
        },
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

  // 个人资产列表（inLibrary = false，仅自己的）
  listMine: protectedProcedure
    .input(
      z.object({
        type: z.enum(["IMAGE", "VIDEO"]).optional(),
        search: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        userId: ctx.userId,
        inLibrary: false,
        isDeleted: false,
      };
      if (input.type) where.type = input.type;
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

      const items = await db.asset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          type: true,
          filename: true,
          originalUrl: true,
          cdnUrl: true,
          thumbnailUrl: true,
          urlThumb: true,
          urlPreview: true,
          blurHash: true,
          width: true,
          height: true,
          isFavorite: true,
          inLibrary: true,
          createdAt: true,
          mimeType: true,
          generation: { select: { prompt: true, type: true } },
          user: { select: { name: true } },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),

  // 移入素材库
  moveToLibrary: protectedProcedure
    .input(z.object({ assetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const asset = await db.asset.findUnique({
        where: { id: input.assetId, userId: ctx.userId },
      });
      if (!asset) throw new TRPCError({ code: "NOT_FOUND" });

      await db.asset.update({
        where: { id: input.assetId },
        data: { inLibrary: true },
      });
      return { success: true };
    }),

  // 删除个人资产（仅限 inLibrary = false）
  deleteMine: protectedProcedure
    .input(z.object({ assetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const asset = await db.asset.findUnique({
        where: { id: input.assetId, userId: ctx.userId },
      });
      if (!asset) throw new TRPCError({ code: "NOT_FOUND" });
      if (asset.inLibrary) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "素材库中的素材不可直接删除，请先联系管理员",
        });
      }

      await db.asset.delete({ where: { id: input.assetId } });
      return { success: true };
    }),

  /** 批量移入回收站（软删除） */
  moveToTrash: protectedProcedure
    .input(z.object({ assetIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      let trashed = 0;
      let directDeleted = 0;
      for (const assetId of input.assetIds) {
        const asset = await db.asset.findUnique({
          where: { id: assetId },
          select: { id: true, userId: true, createdAt: true, type: true, originalUrl: true, urlThumb: true, urlPreview: true },
        });
        if (!asset) continue;

        const grantAccess = isAdminOrManager((ctx as any).userRole);
        if (!grantAccess && asset.userId !== ctx.userId) continue;

        const ageDays = (Date.now() - asset.createdAt.getTime()) / 86400000;
        if (ageDays > 3) {
          await db.asset.delete({ where: { id: assetId } }).catch(() => {});
          directDeleted++;
        } else {
          // 软删除 Asset + 写入回收站记录
          await db.asset.update({
            where: { id: assetId },
            data: { isDeleted: true, deletedAt: new Date() },
          }).catch(() => {});
          await db.trashedCanvasItem.create({
            data: {
              userId: asset.userId,
              itemId: asset.id,
              type: asset.type,
              url: asset.originalUrl,
              prompt: "",
              category: asset.type === "VIDEO" ? "video" : "image",
              source: "library",
              ossOriginalUrl: asset.originalUrl,
              ossThumbUrl: asset.urlThumb,
              ossPreviewUrl: asset.urlPreview,
              originalCreatedAt: asset.createdAt.toISOString(),
              trashedBy: ctx.userId,
            },
          }).catch(() => {});
          trashed++;
        }
      }
      return { trashed, directDeleted };
    }),

  /** 硬删除失败的占位素材（无 OSS 文件，可直接物理删除） */
  hardDeleteFailed: protectedProcedure
    .input(z.object({ assetId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const asset = await db.asset.findUnique({
        where: { id: input.assetId },
        select: { id: true, userId: true, generationStatus: true },
      });
      if (!asset) throw new TRPCError({ code: "NOT_FOUND" });

      const grantAccess = isAdminOrManager((ctx as any).userRole);
      if (!grantAccess && asset.userId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // 仅允许删除失败或生成中的占位素材
      if (asset.generationStatus !== "FAILED" && asset.generationStatus !== "GENERATING") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "仅可删除生成失败或生成中的占位素材",
        });
      }

      // 同时删除关联的 Generation 记录（如果有）
      await db.generation
        .deleteMany({ where: { id: input.assetId, userId: asset.userId } })
        .catch(() => {});
      await db.asset.delete({ where: { id: input.assetId } });

      return { success: true };
    }),
});
