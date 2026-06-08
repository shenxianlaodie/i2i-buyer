import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";
import { isAdminOrManager } from "@/lib/auth-user";

export const canvasRouter = router({
  trashItem: protectedProcedure
    .input(
      z.object({
        itemId: z.string(),
        type: z.enum(["IMAGE", "VIDEO"]),
        url: z.string(),
        prompt: z.string(),
        category: z.string(),
        originalCreatedAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db.trashedCanvasItem.create({
        data: {
          userId: ctx.userId,
          itemId: input.itemId,
          type: input.type,
          url: input.url,
          prompt: input.prompt,
          category: input.category,
          originalCreatedAt: input.originalCreatedAt ?? null,
          trashedBy: ctx.userId,
        },
      });
      return { success: true };
    }),

  listTrashed: protectedProcedure
    .input(
      z
        .object({
          type: z.enum(["IMAGE", "VIDEO"]).optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const grantAccess = isAdminOrManager((ctx as any).userRole);

      const where: Record<string, unknown> = grantAccess ? {} : { userId: ctx.userId };
      if (input?.type) where.type = input.type;
      if (input?.search) {
        where.prompt = { contains: input.search, mode: "insensitive" };
      }
      const items = await db.trashedCanvasItem.findMany({
        where,
        orderBy: { trashedAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });
      return items;
    }),

  permanentDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const trashed = await db.trashedCanvasItem.findUnique({
        where: { id: input.id },
      });
      if (!trashed) throw new TRPCError({ code: "NOT_FOUND" });

      const grantAccess = isAdminOrManager((ctx as any).userRole);
      if (!grantAccess && trashed.userId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (trashed.itemId.startsWith("gen-")) {
        const genId = trashed.itemId.slice(4);
        try {
          await db.generation.delete({ where: { id: genId } });
        } catch {
          // generation may already have been deleted
        }
      }

      await db.trashedCanvasItem.delete({ where: { id: input.id } });
      return { success: true };
    }),
});
