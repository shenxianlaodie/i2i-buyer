import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import {
  generateProductTitle,
  generateProductDescription,
  translateZhToEn,
} from "@/server/ai-gateway/ephone/product-copy";
import { reserveCredits, getCreditCost } from "@/lib/credits";
import { enqueueImage } from "@/server/ai-gateway/worker";
import {
  POSE_TYPES,
  type PoseType,
  DEFAULT_POSE_SELECTION,
} from "@/lib/pose-types";

const poseTypeEnum = z.enum(POSE_TYPES);

const poseOutputsInclude = {
  outputs: {
    include: {
      versions: { orderBy: { createdAt: "desc" as const } },
    },
  },
} as const;

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
        aspectRatio: z.string().optional(),
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

      const generationIds: string[] = [];

      for (const poseType of poses) {
        const generation = await db.generation.create({
          data: {
            userId: ctx.userId,
            type: "IMAGE",
            provider: "EPHONE",
            modelId: input.modelId,
            status: "PENDING",
            prompt: `pose:${poseType}`,
            params: { sourceImageUrl: sourceUrl, poseType, ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}) },
            poseBatchId: row.batchId,
            poseRowId: row.id,
            poseType,
            creditCost: getCreditCost(input.modelId),
          },
        });

        await reserveCredits(ctx.userId, generation.id, input.modelId);
        enqueueImage(generation.id);
        generationIds.push(generation.id);
      }

      return { generationIds, rowId: row.id };
    }),

  regeneratePose: protectedProcedure
    .input(
      z.object({
        rowId: z.string(),
        poseType: poseTypeEnum,
        sourceImageUrl: z.string().min(1),
        modelId: z.string().min(1),
        aspectRatio: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await db.poseRow.findFirst({
        where: { id: input.rowId, batch: { userId: ctx.userId } },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      const generation = await db.generation.create({
        data: {
          userId: ctx.userId,
          type: "IMAGE",
          provider: "EPHONE",
          modelId: input.modelId,
          status: "PENDING",
          prompt: `pose:${input.poseType}`,
          params: {
            sourceImageUrl: input.sourceImageUrl.trim(),
            poseType: input.poseType,
            ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
          },
          poseBatchId: row.batchId,
          poseRowId: row.id,
          poseType: input.poseType,
          creditCost: getCreditCost(input.modelId),
        },
      });

      await reserveCredits(ctx.userId, generation.id, input.modelId);
      enqueueImage(generation.id);
      return { generationId: generation.id, rowId: row.id };
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
