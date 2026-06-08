import type {
  GatewayRegistry,
  ImageGenerationGateway,
  AsyncImageGateway,
  VideoGenerationGateway,
  VideoGenerationJob,
  ProviderId,
} from "./types";
import { MODEL_CONFIGS } from "./model-configs";
import {
  createEphoneImageGateway,
  createEphoneVideoGateway,
} from "./ephone/gateway";
import { createKlingVideoGateway } from "./ephone/kling-gateway";
import { createTuziVideoGateway } from "./ephone/tuzi-gateway";

type ApiKeys = Partial<Record<ProviderId, string>>;

export function createGatewayRegistry(apiKeys: ApiKeys): GatewayRegistry {
  const imageGateways = new Map<
    ProviderId,
    ImageGenerationGateway | AsyncImageGateway
  >();
  const videoGateways = new Map<ProviderId, VideoGenerationGateway>();

  if (apiKeys.ephone) {
    imageGateways.set("ephone", createEphoneImageGateway(apiKeys.ephone));
    videoGateways.set("ephone", createEphoneVideoGateway(apiKeys.ephone));
  }

  // Replicate
  if (apiKeys.replicate) {
    // Dynamic import to avoid loading SDKs when keys aren't available
    const gw = createReplicateGateway(apiKeys.replicate);
    imageGateways.set("replicate", gw);
  }

  // Fal.ai
  if (apiKeys.falai) {
    const gw = createFalaiGateway(apiKeys.falai);
    imageGateways.set("falai", gw);
  }

  // OpenAI (DALL-E)
  if (apiKeys.openai) {
    const gw = createOpenAIGateway(apiKeys.openai);
    imageGateways.set("openai", gw);
  }

  // Runway
  if (apiKeys.runway) {
    const gw = createRunwayGateway(apiKeys.runway);
    videoGateways.set("runway", gw);
  }

  // Pika
  if (apiKeys.pika) {
    const gw = createPikaGateway(apiKeys.pika);
    videoGateways.set("pika", gw);
  }

  // Kling (OmniVideo API via ephone proxy)
  if (apiKeys.kling) {
    const gw = createKlingVideoGateway(apiKeys.kling);
    videoGateways.set("kling", gw);
  }

  // Tuzi (兔子 API) — Sora-2 图生视频 / 文生视频
  if (apiKeys.tuzi) {
    const gw = createTuziVideoGateway(apiKeys.tuzi);
    videoGateways.set("tuzi", gw);
  }

  return {
    getImageGateway(provider: ProviderId) {
      const gw = imageGateways.get(provider);
      if (!gw) throw new Error(`No image gateway for provider: ${provider}`);
      return gw;
    },

    getVideoGateway(provider: ProviderId) {
      const gw = videoGateways.get(provider);
      if (!gw) throw new Error(`No video gateway for provider: ${provider}`);
      return gw;
    },

    listModels(type) {
      return MODEL_CONFIGS.filter(
        (m) =>
          !type ||
          m.type === type ||
          (type === "image" && imageGateways.has(m.providerId)) ||
          (type === "video" && videoGateways.has(m.providerId)),
      );
    },

    getModel(modelId: string) {
      return MODEL_CONFIGS.find((m) => m.id === modelId);
    },

    allProviders() {
      const providers = new Set<ProviderId>();
      imageGateways.forEach((_, p) => providers.add(p));
      videoGateways.forEach((_, p) => providers.add(p));
      return Array.from(providers);
    },
  };
}

// ── Provider Gateway Factories ───────────────────────────

import type { ImageGenerationInput, ImageGenerationOutput } from "./types";

function createReplicateGateway(
  apiToken: string,
): ImageGenerationGateway {
  return {
    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const Replicate = (await import("replicate")).default;
      const replicate = new Replicate({ auth: apiToken });

      const input_: Record<string, unknown> = {
        prompt: input.prompt,
        aspect_ratio: input.aspectRatio ?? "1:1",
        num_outputs: input.numOutputs ?? 1,
        output_format: input.outputFormat ?? "png",
      };

      if (input.negativePrompt) input_.negative_prompt = input.negativePrompt;
      if (input.seed !== undefined) input_.seed = input.seed;
      if (input.guidanceScale !== undefined) input_.guidance = input.guidanceScale;
      if (input.steps !== undefined) input_.num_inference_steps = input.steps;
      if (input.referenceImage) input_.image = input.referenceImage.url;
      if (input.maskImage) input_.mask = input.maskImage.url;

      const startedAt = new Date();
      const output = (await replicate.run(input.modelId as `${string}/${string}`, {
        input: input_,
      })) as string[];

      const images = output.map((url: string) => ({
        url,
        width: input.referenceImage?.width ?? 1024,
        height: input.referenceImage?.height ?? 1024,
        contentType: input.outputFormat === "jpg" ? "image/jpeg" : "image/png",
      }));

      const completedAt = new Date();
      return {
        id: crypto.randomUUID(),
        status: "completed",
        images,
        provider: "replicate",
        modelId: input.modelId,
        providerMetadata: {},
        timing: {
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
        cost: { providerCostUsd: 0.003, creditCost: 5 },
      };
    },
  };
}

function createFalaiGateway(apiKey: string): AsyncImageGateway {
  // Capture submitted model IDs per job for status/result lookups
  const jobModels = new Map<string, string>();

  return {
    async submit(input: ImageGenerationInput) {
      const { fal } = await import("@fal-ai/client");
      fal.config({ credentials: apiKey });

      const result = await fal.subscribe(input.modelId, {
        input: {
          prompt: input.prompt,
          image_size: input.aspectRatio ?? "square_hd",
          num_images: input.numOutputs ?? 1,
        },
      });

      jobModels.set(result.requestId, input.modelId);
      return { jobId: result.requestId };
    },

    async getStatus(jobId: string) {
      const { fal } = await import("@fal-ai/client");
      const modelId = jobModels.get(jobId) ?? "fal-ai/flux/dev";
      const status = await fal.queue.status(modelId, {
        requestId: jobId,
      });
      return { status: status.status };
    },

    async getResult(jobId: string): Promise<ImageGenerationOutput> {
      const { fal } = await import("@fal-ai/client");
      const modelId = jobModels.get(jobId) ?? "fal-ai/flux/dev";
      const result = await fal.queue.result(modelId, {
        requestId: jobId,
      });
      // Not fully implemented - placeholder
      throw new Error("Not implemented");
    },
  };
}

function createOpenAIGateway(apiKey: string): ImageGenerationGateway {
  return {
    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey });

      const sizeMap: Record<string, `${number}x${number}`> = {
        "1:1": "1024x1024",
        "16:9": "1792x1024",
        "9:16": "1024x1792",
      };

      const startedAt = new Date();
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: input.prompt,
        n: 1,
        size: sizeMap[input.aspectRatio ?? "1:1"] ?? "1024x1024",
        quality: "standard",
      });

      const data = response.data;
      const completedAt = new Date();
      return {
        id: crypto.randomUUID(),
        status: "completed",
        images: (data ?? []).map((img) => ({
          url: img.url!,
          width: 1024,
          height: 1024,
          contentType: "image/png",
        })),
        provider: "openai",
        modelId: "dall-e-3",
        providerMetadata: { revisedPrompt: data?.[0]?.revised_prompt },
        timing: {
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
        cost: { providerCostUsd: 0.04, creditCost: 20 },
      };
    },
  };
}

function createRunwayGateway(apiKey: string): VideoGenerationGateway {
  return {
    async submit(input) {
      const resp = await fetch(`${process.env.RUNWAY_BASE_URL}/text_to_video`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt_text: input.prompt,
          duration: input.duration ?? 8,
          model: "gen4",
        }),
      });
      const data = await resp.json() as { id: string };
      return {
        jobId: data.id,
        provider: "runway",
        modelId: input.modelId,
        status: "queued" as const,
        estimatedCompletion: null,
        providerMetadata: data,
      };
    },

    async getStatus(jobId: string): Promise<VideoGenerationJob> {
      const resp = await fetch(
        `${process.env.RUNWAY_BASE_URL}/tasks/${jobId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      const data = (await resp.json()) as { status: string; progress?: number };
      const statusMap: Record<string, VideoGenerationJob["status"]> = {
        PENDING: "queued",
        PROCESSING: "processing",
        SUCCEEDED: "completed",
        FAILED: "failed",
      };
      return {
        jobId,
        provider: "runway",
        modelId: "runway/gen-4",
        status: statusMap[data.status] ?? "processing",
        estimatedCompletion: null,
        providerMetadata: data,
      };
    },

    async getResult(jobId: string) {
      const resp = await fetch(
        `${process.env.RUNWAY_BASE_URL}/tasks/${jobId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      const data = await resp.json() as { output?: string[] };
      const videos = (data.output ?? []).map((url: string) => ({
        url,
        width: 1280,
        height: 720,
        duration: 8,
        contentType: "video/mp4",
      }));
      return {
        id: jobId,
        status: "completed" as const,
        videos,
        provider: "runway",
        modelId: "runway/gen-4",
        providerMetadata: data,
        timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 },
        cost: { providerCostUsd: 0.5, creditCost: 50 },
      };
    },

    async cancelJob(_jobId: string) {
      // Runway cancellation support depends on task state
    },
  };
}

function createPikaGateway(apiKey: string): VideoGenerationGateway {
  return {
    async submit(input) {
      const resp = await fetch(`${process.env.PIKA_BASE_URL}/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: input.prompt,
          duration: input.duration ?? 8,
          aspectRatio: input.aspectRatio ?? "16:9",
        }),
      });
      const data = await resp.json() as { id: string };
      return {
        jobId: data.id,
        provider: "pika",
        modelId: input.modelId,
        status: "queued",
        estimatedCompletion: null,
        providerMetadata: data,
      };
    },

    async getStatus(jobId: string) {
      const resp = await fetch(
        `${process.env.PIKA_BASE_URL}/generate/${jobId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      const data = await resp.json() as { status: string };
      const statusMap: Record<string, "queued" | "processing" | "completed" | "failed"> = {
        pending: "queued",
        processing: "processing",
        done: "completed",
        failed: "failed",
      };
      return {
        jobId,
        provider: "pika",
        modelId: "pika/2.0",
        status: statusMap[data.status] ?? "processing",
        estimatedCompletion: null,
        providerMetadata: data,
      };
    },

    async getResult(jobId: string) {
      const resp = await fetch(
        `${process.env.PIKA_BASE_URL}/generate/${jobId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      const data = await resp.json() as { result?: { video?: string; thumbnail?: string } };
      const videos = data.result?.video
        ? [{ url: data.result.video, thumbnailUrl: data.result.thumbnail, width: 1920, height: 1080, duration: 8, contentType: "video/mp4" }]
        : [];
      return {
        id: jobId,
        status: "completed" as const,
        videos,
        provider: "pika",
        modelId: "pika/2.0",
        providerMetadata: data,
        timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 },
        cost: { providerCostUsd: 0.3, creditCost: 30 },
      };
    },

    async cancelJob(_jobId: string) {},
  };
}

function createKlingGateway(_apiKey: string): VideoGenerationGateway {
  // Kling 网关已迁移至 ephone/kling-gateway.ts，使用 OmniVideo API
  // 此函数保留作为兼容处理，实际不会走到这里
  throw new Error("Kling gateway is now in ephone/kling-gateway.ts");
}
