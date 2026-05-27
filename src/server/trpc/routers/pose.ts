import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { runPoseImage } from "@/server/ai-gateway/ephone/pose";
import {
  generateProductTitle,
  generateProductDescription,
  translateZhToEn,
} from "@/server/ai-gateway/ephone/product-copy";
import {
  checkBalance,
  reserveCredits,
  refundCredits,
  getCreditCost,
} from "@/lib/credits";
import {
  POSE_TYPES,
  type PoseType,
  DEFAULT_POSE_SELECTION,
} from "@/lib/pose-types";
import { createGenerationAuditData } from "@/lib/generation-record";

const poseTypeEnum = z.enum(POSE_TYPES);

const poseOutputsInclude = {
  outputs: {
    include: {
      versions: { orderBy: { createdAt: "desc" as const } },
    },
  },
} as const;

async function appendPoseOutputVersion(
  rowId: string,
  poseType: string,
  outputUrl: string,
  generationId: string,
) {
  const slot = await db.poseOutput.upsert({
    where: { rowId_poseType: { rowId, poseType } },
    create: { rowId, poseType },
    update: {},
  });

  const version = await db.poseOutputVersion.create({
    data: {
      outputId: slot.id,
      outputUrl,
      generationId,
    },
  });

  return db.poseOutput.update({
    where: { id: slot.id },
    data: {
      outputUrl,
      generationId,
      activeVersionId: version.id,
    },
    include: { versions: { orderBy: { createdAt: "desc" } } },
  });
}

async function getPoseBatchForUser(userId: string, batchId?: string) {
  if (batchId) {
    const batch = await db.poseBatch.findFirst({
      where: { id: batchId, userId },
      include: {
        rows: {
          orderBy: { sortOrder: "asc" },
          include: poseOutputsInclude,
        },
      },
    });
    if (!batch) throw new TRPCError({ code: "NOT_FOUND" });
    return batch;
  }

  let batch = await db.poseBatch.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      rows: {
        orderBy: { sortOrder: "asc" },
        include: poseOutputsInclude,
      },
    },
  });

  if (!batch) {
    batch = await db.poseBatch.create({
      data: {
        userId,
        title: "多姿势任务",
        rows: { create: { sortOrder: 0 } },
      },
      include: {
        rows: {
          orderBy: { sortOrder: "asc" },
          include: poseOutputsInclude,
        },
      },
    });
  } else if (batch.rows.length === 0) {
    await db.poseRow.create({
      data: { batchId: batch.id, sortOrder: 0 },
    });
    batch = await db.poseBatch.findFirst({
      where: { id: batch.id },
      include: {
        rows: {
          orderBy: { sortOrder: "asc" },
          include: poseOutputsInclude,
        },
      },
    })!;
  }

  return batch;
}

export const poseRouter = router({
  getBatch: protectedProcedure
    .input(z.object({ batchId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return getPoseBatchForUser(ctx.userId, input?.batchId);
    }),

  createBatch: protectedProcedure
    .input(z.object({ title: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return db.poseBatch.create({
        data: {
          userId: ctx.userId,
          title: input.title ?? "多姿势任务",
          rows: { create: { sortOrder: 0 } },
        },
        include: {
          rows: { orderBy: { sortOrder: "asc" } },
        },
      });
    }),

  importSourceImages: protectedProcedure
    .input(
      z.object({
        batchId: z.string(),
        fromRowId: z.string(),
        sourceImageUrls: z.array(z.string()).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const batch = await db.poseBatch.findFirst({
        where: { id: input.batchId, userId: ctx.userId },
        include: { rows: { orderBy: { sortOrder: "asc" } } },
      });
      if (!batch) throw new TRPCError({ code: "NOT_FOUND" });

      const fromIdx = batch.rows.findIndex((r) => r.id === input.fromRowId);
      if (fromIdx < 0) throw new TRPCError({ code: "NOT_FOUND" });

      const urls = input.sourceImageUrls;
      const fromRow = batch.rows[fromIdx];

      const assignments: { rowId: string; sourceImageUrl: string }[] = [
        { rowId: input.fromRowId, sourceImageUrl: urls[0] },
      ];

      const extra = urls.slice(1);
      if (extra.length === 0) {
        return { created: 0, assignments };
      }

      const afterRows = batch.rows.slice(fromIdx + 1);
      await Promise.all(
        afterRows.map((r) =>
          db.poseRow.update({
            where: { id: r.id },
            data: { sortOrder: r.sortOrder + extra.length },
          }),
        ),
      );

      await Promise.all(
        extra.map((url, i) =>
          db.poseRow
            .create({
              data: {
                batchId: input.batchId,
                sortOrder: fromRow.sortOrder + 1 + i,
              },
            })
            .then((row) => {
              assignments.push({ rowId: row.id, sourceImageUrl: url });
            }),
        ),
      );

      await db.poseBatch.update({
        where: { id: input.batchId },
        data: { updatedAt: new Date() },
      });

      return { created: extra.length, assignments };
    }),

  addRow: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const batch = await db.poseBatch.findFirst({
        where: { id: input.batchId, userId: ctx.userId },
        include: { _count: { select: { rows: true } } },
      });
      if (!batch) throw new TRPCError({ code: "NOT_FOUND" });

      return db.poseRow.create({
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
        poseSelection: z.array(poseTypeEnum).optional(),
        productTitle: z.string().optional(),
        productDescription: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await db.poseRow.findFirst({
        where: { id: input.rowId, batch: { userId: ctx.userId } },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      return db.poseRow.update({
        where: { id: input.rowId },
        data: {
          ...(input.poseSelection !== undefined
            ? { poseSelection: input.poseSelection }
            : {}),
          ...(input.productTitle !== undefined
            ? { productTitle: input.productTitle }
            : {}),
          ...(input.productDescription !== undefined
            ? { productDescription: input.productDescription }
            : {}),
        },
      });
    }),

  deleteRow: protectedProcedure
    .input(z.object({ rowId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await db.poseRow.findFirst({
        where: { id: input.rowId, batch: { userId: ctx.userId } },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await db.poseRow.delete({ where: { id: input.rowId } });
      return { success: true };
    }),

  generatePoses: protectedProcedure
    .input(
      z.object({
        rowId: z.string(),
        poses: z.array(poseTypeEnum).optional(),
        sourceImageUrl: z.string().min(1),
        modelId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await db.poseRow.findFirst({
        where: { id: input.rowId, batch: { userId: ctx.userId } },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      if (!input.sourceImageUrl?.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请先上传参考图",
        });
      }
      const sourceUrl = input.sourceImageUrl.trim();

      const poses = (input.poses?.length
        ? input.poses
        : row.poseSelection.length
          ? row.poseSelection
          : DEFAULT_POSE_SELECTION) as PoseType[];

      if (poses.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请至少勾选一个姿势",
        });
      }

      const totalCost = getCreditCost(input.modelId) * poses.length;
      const user = await db.user.findUnique({ where: { id: ctx.userId } });
      if (!user || user.credits < totalCost) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `积分不足：需要 ${totalCost}，当前 ${user?.credits ?? 0}`,
        });
      }

      const results: { poseType: PoseType; outputUrl: string }[] = [];

      for (const poseType of poses) {
        const generation = await db.generation.create({
          data: createGenerationAuditData({
            userId: ctx.userId,
            modelId: input.modelId,
            prompt: `pose:${poseType}`,
            creditCost: getCreditCost(input.modelId),
            poseType,
            snapshot: {
              kind: "pose",
              batchId: row.batchId,
              rowId: row.id,
              poseType,
              hasSource: true,
            },
          }),
        });

        await reserveCredits(ctx.userId, generation.id, input.modelId);

        try {
          const result = await runPoseImage({
            sourceImageUrl: sourceUrl,
            poseType,
            modelId: input.modelId,
          });

          await appendPoseOutputVersion(
            row.id,
            poseType,
            result.url,
            generation.id,
          );

          await db.generation.update({
            where: { id: generation.id },
            data: {
              status: "COMPLETED",
              completedAt: new Date(),
              outputUrls: [result.url],
            },
          });

          results.push({ poseType, outputUrl: result.url });
        } catch (err) {
          const message = err instanceof Error ? err.message : "生成失败";
          await db.generation.update({
            where: { id: generation.id },
            data: {
              status: "FAILED",
              errorMessage: message,
              completedAt: new Date(),
            },
          });
          await refundCredits(ctx.userId, generation.id);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
        }
      }

      await db.poseBatch.update({
        where: { id: row.batchId },
        data: { updatedAt: new Date() },
      });

      return { results, sourceUrl };
    }),

  regeneratePose: protectedProcedure
    .input(
      z.object({
        rowId: z.string(),
        poseType: poseTypeEnum,
        sourceImageUrl: z.string().min(1),
        modelId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await db.poseRow.findFirst({
        where: { id: input.rowId, batch: { userId: ctx.userId } },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      const sourceUrl = input.sourceImageUrl.trim();

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
          prompt: `pose:${input.poseType}`,
          creditCost: getCreditCost(input.modelId),
          poseType: input.poseType,
          snapshot: {
            kind: "pose",
            batchId: row.batchId,
            rowId: row.id,
            poseType: input.poseType,
            hasSource: true,
          },
        }),
      });

      await reserveCredits(ctx.userId, generation.id, input.modelId);

      try {
        const result = await runPoseImage({
          sourceImageUrl: sourceUrl,
          poseType: input.poseType,
          modelId: input.modelId,
        });

        const output = await appendPoseOutputVersion(
          row.id,
          input.poseType,
          result.url,
          generation.id,
        );

        await db.generation.update({
          where: { id: generation.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            outputUrls: [result.url],
          },
        });

        await db.poseBatch.update({
          where: { id: row.batchId },
          data: { updatedAt: new Date() },
        });

        return { poseType: input.poseType, outputUrl: result.url, output };
      } catch (err) {
        const message = err instanceof Error ? err.message : "生成失败";
        await db.generation.update({
          where: { id: generation.id },
          data: {
            status: "FAILED",
            errorMessage: message,
            completedAt: new Date(),
          },
        });
        await refundCredits(ctx.userId, generation.id);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),

  generateProductCopy: protectedProcedure
    .input(
      z.object({
        rowId: z.string(),
        sourceImageUrl: z.string().min(1),
        fields: z.enum(["title", "description", "both"]).default("both"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await db.poseRow.findFirst({
        where: { id: input.rowId, batch: { userId: ctx.userId } },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      const sourceUrl = input.sourceImageUrl.trim();
      if (!sourceUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "请先上传参考图",
        });
      }

      let productTitle = row.productTitle;
      let productDescription = row.productDescription;

      if (input.fields === "title" || input.fields === "both") {
        productTitle = await generateProductTitle(sourceUrl);
      }
      if (input.fields === "description" || input.fields === "both") {
        productDescription = await generateProductDescription(sourceUrl);
      }

      const updated = await db.poseRow.update({
        where: { id: row.id },
        data: {
          ...(productTitle !== undefined ? { productTitle } : {}),
          ...(productDescription !== undefined
            ? { productDescription }
            : {}),
        },
      });

      await db.poseBatch.update({
        where: { id: row.batchId },
        data: { updatedAt: new Date() },
      });

      return {
        productTitle: updated.productTitle ?? "",
        productDescription: updated.productDescription ?? "",
      };
    }),

  translateProductCopy: protectedProcedure
    .input(z.object({ text: z.string().min(1).max(8000) }))
    .mutation(async ({ input }) => {
      const english = await translateZhToEn(input.text);
      return { english };
    }),

  setActivePoseVersion: protectedProcedure
    .input(
      z.object({
        outputId: z.string(),
        versionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const version = await db.poseOutputVersion.findFirst({
        where: {
          id: input.versionId,
          outputId: input.outputId,
          output: { row: { batch: { userId: ctx.userId } } },
        },
      });
      if (!version) throw new TRPCError({ code: "NOT_FOUND" });

      return db.poseOutput.update({
        where: { id: input.outputId },
        data: {
          activeVersionId: version.id,
          outputUrl: version.outputUrl,
          generationId: version.generationId,
        },
        include: { versions: { orderBy: { createdAt: "desc" } } },
      });
    }),
});
