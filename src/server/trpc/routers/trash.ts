import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";

export const trashRouter = router({
  /** 列出回收站内容 */
  list: protectedProcedure
    .input(
      z.object({
        source: z.enum(["canvas", "library"]).optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      const isAdmin = (ctx as any).userRole?.toUpperCase() === "ADMIN";
      const where: Record<string, unknown> = isAdmin ? {} : { userId: ctx.userId };
      if (input.source) where.source = input.source;

      const items = await db.trashedCanvasItem.findMany({
        where,
        orderBy: { trashedAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: { user: { select: { id: true, name: true } } },
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        nextCursor = items.pop()?.id;
      }

      return { items, nextCursor };
    }),

  /** 移入回收站 */
  trash: protectedProcedure
    .input(
      z.object({
        source: z.enum(["canvas", "library"]),
        assetId: z.string(),
        type: z.enum(["IMAGE", "VIDEO"]),
        url: z.string(),
        prompt: z.string().optional(),
        ossOriginalUrl: z.string().optional(),
        ossThumbUrl: z.string().optional(),
        ossPreviewUrl: z.string().optional(),
        originalCreatedAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 检查是否超过3天 → 直接永久删除
      const ageDays = input.originalCreatedAt
        ? (Date.now() - new Date(input.originalCreatedAt).getTime()) / 86400000
        : 0;

      if (ageDays > 3) {
        // 直接删除 Asset 记录
        try {
          await db.asset.delete({ where: { id: input.assetId } });
        } catch {
          // 可能已被删除
        }
        return { directDeleted: true };
      }

      await db.trashedCanvasItem.create({
        data: {
          userId: ctx.userId,
          itemId: input.assetId,
          type: input.type,
          url: input.url,
          prompt: input.prompt ?? "",
          category: input.type === "VIDEO" ? "video" : "image",
          source: input.source,
          ossOriginalUrl: input.ossOriginalUrl,
          ossThumbUrl: input.ossThumbUrl,
          ossPreviewUrl: input.ossPreviewUrl,
          originalCreatedAt: input.originalCreatedAt?.toISOString() ?? null,
          trashedBy: ctx.userId,
        },
      });

      // 删除 Asset 记录（已移入回收站）
      try {
        await db.asset.delete({ where: { id: input.assetId } });
      } catch {
        // 可能已被删除
      }

      return { directDeleted: false };
    }),

  /** 从回收站恢复 */
  restore: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.trashedCanvasItem.findUnique({ where: { id: input.id } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });

      const isAdmin = (ctx as any).userRole?.toUpperCase() === "ADMIN";
      if (!isAdmin && item.userId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // 检查原 Asset 是否还存在（可能被软删除而非硬删除）
      const existing = await db.asset.findUnique({ where: { id: item.itemId } });
      if (existing) {
        // 原记录还在（软删除场景），恢复即可
        await db.asset.update({
          where: { id: item.itemId },
          data: { isDeleted: false, deletedAt: null },
        });
      } else {
        // 原记录已被硬删除，重建
        await db.asset.create({
          data: {
            id: item.itemId,
            userId: item.userId,
            type: item.type,
            filename: `${item.source ?? "restored"}-${item.itemId}.png`,
            originalUrl: item.ossOriginalUrl || item.url,
            urlThumb: item.ossThumbUrl,
            urlPreview: item.ossPreviewUrl,
            mimeType: "image/png",
            createdAt: item.originalCreatedAt ? new Date(item.originalCreatedAt) : undefined,
          },
        });
      }

      await db.trashedCanvasItem.delete({ where: { id: input.id } });
      return { success: true };
    }),

  /** 永久删除 */
  permanentDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.trashedCanvasItem.findUnique({ where: { id: input.id } });
      if (!item) throw new TRPCError({ code: "NOT_FOUND" });

      const isAdmin = (ctx as any).userRole?.toUpperCase() === "ADMIN";
      if (!isAdmin && item.userId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db.trashedCanvasItem.delete({ where: { id: input.id } });

      // TODO: 异步删除 OSS 中三张图片（原图+缩略图+预览图）
      // 可通过 OSS upload server 的删除接口实现

      return { success: true };
    }),

  /** 定时清理（可由 cron 调用） */
  cleanup: protectedProcedure.mutation(async () => {
    const now = new Date();

    // 回收站超过3天的 → 永久删除
    const trashThreshold = new Date(now.getTime() - 3 * 86400000);
    const oldTrash = await db.trashedCanvasItem.findMany({
      where: { trashedAt: { lt: trashThreshold } },
      select: { id: true },
    });
    for (const t of oldTrash) {
      await db.trashedCanvasItem.delete({ where: { id: t.id } }).catch(() => {});
    }

    // 素材库超过7天的 → 自动移入回收站
    const assetThreshold = new Date(now.getTime() - 7 * 86400000);
    const oldAssets = await db.asset.findMany({
      where: { createdAt: { lt: assetThreshold } },
      select: { id: true, type: true, userId: true, originalUrl: true, urlThumb: true, urlPreview: true, createdAt: true },
    });
    for (const a of oldAssets) {
      await db.trashedCanvasItem.create({
        data: {
          userId: a.userId,
          itemId: a.id,
          type: a.type,
          url: a.originalUrl,
          prompt: "",
          category: a.type === "VIDEO" ? "video" : "image",
          source: "library",
          ossOriginalUrl: a.originalUrl,
          ossThumbUrl: a.urlThumb,
          ossPreviewUrl: a.urlPreview,
          originalCreatedAt: a.createdAt.toISOString(),
          trashedBy: "system",
        },
      });
      await db.asset.delete({ where: { id: a.id } }).catch(() => {});
    }

    return {
      trashDeleted: oldTrash.length,
      assetsTrashed: oldAssets.length,
    };
  }),
});
