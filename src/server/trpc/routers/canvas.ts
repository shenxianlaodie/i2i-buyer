import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";

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

  listTrashed: adminProcedure
    .input(
      z
        .object({
          type: z.enum(["IMAGE", "VIDEO"]).optional(),
          search: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const where: Record<string, unknown> = {};
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

  permanentDelete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const trashed = await db.trashedCanvasItem.findUnique({
        where: { id: input.id },
      });
      if (!trashed) throw new TRPCError({ code: "NOT_FOUND" });

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
