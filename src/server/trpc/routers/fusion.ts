import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { runFusionImage } from "@/server/ai-gateway/ephone/fusion";
import { checkBalance, reserveCredits, refundCredits, getCreditCost } from "@/lib/credits";
import { createGenerationAuditData } from "@/lib/generation-record";

async function getBatchForUser(userId: string, batchId?: string) {
  if (batchId) {
    const batch = await db.fusionBatch.findFirst({
      where: { id: batchId, userId },
      include: {
        rows: {
          orderBy: { sortOrder: "asc" },
          include: {
            versions: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });
    if (!batch) throw new TRPCError({ code: "NOT_FOUND" });
    return batch;
  }

  let batch = await db.fusionBatch.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      rows: {
        orderBy: { sortOrder: "asc" },
        include: {
          versions: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });

  if (!batch) {
    batch = await db.fusionBatch.create({
      data: {
        userId,
        title: "融合图任务",
        rows: { create: { sortOrder: 0 } },
      },
      include: {
        rows: {
          orderBy: { sortOrder: "asc" },
          include: {
            versions: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });
  } else if (batch.rows.length === 0) {
    await db.fusionRow.create({
      data: { batchId: batch.id, sortOrder: 0 },
    });
    batch = await db.fusionBatch.findFirst({
      where: { id: batch.id },
      include: {
        rows: {
          orderBy: { sortOrder: "asc" },
          include: {
            versions: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    })!;
  }

  return batch;
}

export const fusionRouter = router({
  getBatch: protectedProcedure
    .input(z.object({ batchId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getBatchForUser(ctx.userId, input?.batchId);
    }),

  createBatch: protectedProcedure
    .input(z.object({ title: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return db.fusionBatch.create({
        data: {
          userId: ctx.userId,
          title: input.title ?? "融合图任务",
          rows: { create: { sortOrder: 0 } },
        },
        include: {
          rows: { orderBy: { sortOrder: "asc" } },
        },
      });
    }),

  importBaseImages: protectedProcedure
    .input(
      z.object({
        batchId: z.string(),
        fromRowId: z.string(),
        baseImageUrls: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const batch = await db.fusionBatch.findFirst({
        where: { id: input.batchId, userId: ctx.userId },
        include: { rows: { orderBy: { sortOrder: "asc" } } },
      });
      if (!batch) throw new TRPCError({ code: "NOT_FOUND" });

      const fromIdx = batch.rows.findIndex((r) => r.id === input.fromRowId);
      if (fromIdx < 0) throw new TRPCError({ code: "NOT_FOUND" });

      const urls = input.baseImageUrls;
      const fromRow = batch.rows[fromIdx];
      const groupSize = urls.length;
      const anchorId = input.fromRowId;

      const assignments: { rowId: string; baseImageUrl: string }[] = [
        { rowId: input.fromRowId, baseImageUrl: urls[0] },
      ];

      await db.fusionRow.update({
        where: { id: input.fromRowId },
        data: {
          baseGroupAnchorId: anchorId,
          baseGroupSize: groupSize,
        },
      });

      const extra = urls.slice(1);
      if (extra.length === 0) {
        return { created: 0, groupSize, assignments };
      }

      const afterRows = batch.rows.slice(fromIdx + 1);
      await Promise.all(
        afterRows.map((r) =>
          db.fusionRow.update({
            where: { id: r.id },
            data: { sortOrder: r.sortOrder + extra.length },
          }),
        ),
      );

      const createdRows = await Promise.all(
        extra.map((url, i) =>
          db.fusionRow
            .create({
              data: {
                batchId: input.batchId,
                sortOrder: fromRow.sortOrder + 1 + i,
                baseGroupAnchorId: anchorId,
              },
            })
            .then((row) => {
              assignments.push({ rowId: row.id, baseImageUrl: url });
              return row;
            }),
        ),
      );
      void createdRows;

      await db.fusionBatch.update({
        where: { id: input.batchId },
        data: { updatedAt: new Date() },
      });

      return { created: extra.length, groupSize, assignments };
    }),

  importPrintImages: protectedProcedure
    .input(
      z.object({
        batchId: z.string(),
        anchorRowId: z.string(),
        printImageUrls: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const anchor = await db.fusionRow.findFirst({
        where: {
          id: input.anchorRowId,
          batch: { id: input.batchId, userId: ctx.userId },
        },
      });
      if (!anchor) throw new TRPCError({ code: "NOT_FOUND" });

      if (
        !anchor.baseGroupSize ||
        anchor.baseGroupAnchorId !== anchor.id
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请先在当前行批量添加底版",
        });
      }

      const c = input.printImageUrls.length;
      const b = anchor.baseGroupSize;
      if (c > b) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `印花数量（${c}）不能超过底版数量（${b}）`,
        });
      }

      const groupRows = await db.fusionRow.findMany({
        where: {
          batchId: input.batchId,
          baseGroupAnchorId: anchor.id,
        },
        orderBy: { sortOrder: "asc" },
      });

      if (groupRows.length < c) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "底版组行数异常，请重新导入底版",
        });
      }

      const assignments = input.printImageUrls.map((url, i) => ({
        rowId: groupRows[i].id,
        printImageUrl: url,
      }));

      await db.fusionBatch.update({
        where: { id: input.batchId },
        data: { updatedAt: new Date() },
      });

      return { assigned: c, groupSize: b, assignments };
    }),

  addRow: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const batch = await db.fusionBatch.findFirst({
        where: { id: input.batchId, userId: ctx.userId },
        include: { _count: { select: { rows: true } } },
      });
      if (!batch) throw new TRPCError({ code: "NOT_FOUND" });

      return db.fusionRow.create({
        data: {
          batchId: input.batchId,
          sortOrder: batch._count.rows,
        },
      });
    }),

  updateRow: protectedProcedure
    .input(
      z.object({
        rowId: z.string(),
        prompt: z.string().optional(),
        remark: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await db.fusionRow.findFirst({
        where: { id: input.rowId, batch: { userId: ctx.userId } },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      return db.fusionRow.update({
        where: { id: input.rowId },
        data: {
          ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
          ...(input.remark !== undefined ? { remark: input.remark } : {}),
        },
      });
    }),

  deleteRow: protectedProcedure
    .input(z.object({ rowId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await db.fusionRow.findFirst({
        where: { id: input.rowId, batch: { userId: ctx.userId } },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await db.fusionRow.delete({ where: { id: input.rowId } });
      return { success: true };
    }),

  fillDownPrompt: protectedProcedure
    .input(
      z.object({
        batchId: z.string(),
        fromRowId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const batch = await db.fusionBatch.findFirst({
        where: { id: input.batchId, userId: ctx.userId },
        include: { rows: { orderBy: { sortOrder: "asc" } } },
      });
      if (!batch) throw new TRPCError({ code: "NOT_FOUND" });

      const fromIdx = batch.rows.findIndex((r) => r.id === input.fromRowId);
      if (fromIdx < 0) throw new TRPCError({ code: "NOT_FOUND" });
      const prompt = batch.rows[fromIdx].prompt;
      const toUpdate = batch.rows.slice(fromIdx + 1);
      await Promise.all(
        toUpdate.map((r) =>
          db.fusionRow.update({
            where: { id: r.id },
            data: { prompt },
          }),
        ),
      );
      return { updated: toUpdate.length };
    }),

  generate: protectedProcedure
    .input(
      z.object({
        rowId: z.string(),
        modelId: z.string().min(1),
        baseImageUrl: z.string().min(1),
        printImageUrl: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await db.fusionRow.findFirst({
        where: { id: input.rowId, batch: { userId: ctx.userId } },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      const baseImageUrl = input.baseImageUrl.trim();
      const printImageUrl = input.printImageUrl.trim();

      const balance = await checkBalance(ctx.userId, input.modelId);
      if (!balance.ok) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `积分不足：需要 ${balance.required}，当前 ${balance.current}`,
        });
      }

      const generation = await db.generation.create({
        data: createGenerationAuditData({
          userId: ctx.userId,
          modelId: input.modelId,
          prompt: row.prompt,
          creditCost: getCreditCost(input.modelId),
          snapshot: {
            kind: "fusion",
            batchId: row.batchId,
            rowId: row.id,
            hasBase: true,
            hasPrint: true,
          },
        }),
      });

      await reserveCredits(ctx.userId, generation.id, input.modelId);

      try {
        const result = await runFusionImage({
          baseImageUrl,
          printImageUrl,
          prompt: row.prompt,
          modelId: input.modelId,
        });

        const version = await db.fusionVersion.create({
          data: {
            rowId: row.id,
            prompt: row.prompt,
            outputUrl: result.url,
            generationId: generation.id,
          },
        });

        await db.fusionRow.update({
          where: { id: row.id },
          data: { activeVersionId: version.id },
        });

        await db.generation.update({
          where: { id: generation.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            outputUrls: [result.url],
          },
        });

        await db.fusionBatch.update({
          where: { id: row.batchId },
          data: { updatedAt: new Date() },
        });

        return { version, outputUrl: result.url };
      } catch (err) {
        const message = err instanceof Error ? err.message : "生成失败";
        await db.generation.update({
          where: { id: generation.id },
          data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
        });
        await refundCredits(ctx.userId, generation.id);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),

  setActiveVersion: protectedProcedure
    .input(
      z.object({
        rowId: z.string(),
        versionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const version = await db.fusionVersion.findFirst({
        where: {
          id: input.versionId,
          rowId: input.rowId,
          row: { batch: { userId: ctx.userId } },
        },
      });
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      await db.fusionRow.update({
        where: { id: input.rowId },
        data: { activeVersionId: version.id },
      });
      return version;
    }),

  listVersions: protectedProcedure
    .input(z.object({ rowId: z.string() }))
    .query(async ({ ctx, input }) => {
      const row = await db.fusionRow.findFirst({
        where: { id: input.rowId, batch: { userId: ctx.userId } },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      return db.fusionVersion.findMany({
        where: { rowId: input.rowId },
        orderBy: { createdAt: "desc" },
      });
    }),

});
