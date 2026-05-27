import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "@/server/trpc/init";
import { MODEL_CONFIGS } from "@/server/ai-gateway/model-configs";
import {
  fetchEphoneModels,
  filterEphoneModels,
  type EphoneModelCategory,
} from "@/server/ai-gateway/ephone/models";

const capabilityEnum = z.enum([
  "text-to-image",
  "image-to-image",
  "inpainting",
  "text-to-video",
  "image-to-video",
  "upscale",
]);

export const providerRouter = router({
  listModels: publicProcedure
    .input(
      z.object({
        type: z.enum(["image", "video"]).optional(),
        capability: capabilityEnum.optional(),
      }),
    )
    .query(async ({ input }) => {
      let models = MODEL_CONFIGS;
      if (input.type) models = models.filter((m) => m.type === input.type);
      if (input.capability)
        models = models.filter((m) => m.capabilities.includes(input.capability!));
      return models;
    }),

  getModel: publicProcedure
    .input(z.object({ modelId: z.string() }))
    .query(async ({ input }) => {
      return MODEL_CONFIGS.find((m) => m.id === input.modelId) ?? null;
    }),

  listEphoneModels: publicProcedure
    .input(
      z
        .object({
          category: z.enum(["image", "video", "other"]).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      if (!process.env.EPHONE_API_KEY) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "未配置 EPHONE_API_KEY",
        });
      }
      try {
        const models = await fetchEphoneModels();
        return filterEphoneModels(
          models,
          input?.category as EphoneModelCategory | undefined,
        );
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : "获取模型列表失败",
        });
      }
    }),
});
