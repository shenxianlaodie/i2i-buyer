import type {
  ImageGenerationGateway,
  ImageGenerationInput,
  ImageGenerationOutput,
  VideoGenerationGateway,
  VideoGenerationInput,
  VideoGenerationJob,
  VideoGenerationOutput,
  AspectRatio,
} from "../types";
import { EphoneClient } from "./client";

const SIZE_MAP: Record<AspectRatio, `${number}x${number}`> = {
  "1:1": "1024x1024",
  "16:9": "1792x1024",
  "9:16": "1024x1792",
  "4:3": "1024x768",
  "3:4": "768x1024",
  "21:9": "1792x768",
};

async function urlToFile(url: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reference image: ${res.status}`);
  const blob = await res.blob();
  const ext = blob.type.includes("jpeg") ? "jpg" : "png";
  return new File([blob], `reference.${ext}`, { type: blob.type || "image/png" });
}

export function createEphoneImageGateway(apiKey: string): ImageGenerationGateway {
  const ephone = new EphoneClient(apiKey);

  return {
    async generate(input: ImageGenerationInput): Promise<ImageGenerationOutput> {
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey,
        baseURL: ephone.openaiBaseUrl,
      });

      const startedAt = new Date();
      const size = SIZE_MAP[input.aspectRatio ?? "1:1"] ?? "1024x1024";
      if (!input.modelId) {
        throw new Error("请选择图片模型");
      }
      const model = input.modelId;

      let data: { url?: string | null; b64_json?: string | null; revised_prompt?: string }[];

      if (input.referenceImage?.url) {
        const imageFile = await urlToFile(input.referenceImage.url);
        const response = await openai.images.edit({
          model,
          image: imageFile,
          prompt: input.prompt,
          size,
          n: input.numOutputs ?? 1,
        });
        data = response.data ?? [];
      } else {
        const response = await openai.images.generate({
          model,
          prompt: input.prompt,
          size,
          n: input.numOutputs ?? 1,
        });
        data = response.data ?? [];
      }

      const completedAt = new Date();
      const images = data.map((img) => {
        if (img.url) {
          return {
            url: img.url,
            width: 1024,
            height: 1024,
            contentType: "image/png",
          };
        }
        if (img.b64_json) {
          return {
            url: `data:image/png;base64,${img.b64_json}`,
            width: 1024,
            height: 1024,
            contentType: "image/png",
          };
        }
        throw new Error("ePhone returned empty image data");
      });

      return {
        id: crypto.randomUUID(),
        status: "completed",
        images,
        provider: "ephone",
        modelId: model,
        providerMetadata: { revisedPrompt: data[0]?.revised_prompt },
        timing: {
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
        cost: { providerCostUsd: 0.04, creditCost: 10 },
      };
    },
  };
}

export function createEphoneVideoGateway(apiKey: string): VideoGenerationGateway {
  const ephone = new EphoneClient(apiKey);

  return {
    async submit(input: VideoGenerationInput): Promise<VideoGenerationJob> {
      if (!input.modelId) {
        throw new Error("请选择视频模型");
      }
      const model = input.modelId;
      const refUrl =
        input.referenceImage?.url ?? input.startFrameUrl ?? undefined;

      const taskInput: Record<string, unknown> = {
        prompt: input.prompt,
        duration: String(input.duration ?? 5),
        aspect_ratio: input.aspectRatio ?? "16:9",
      };
      if (refUrl) {
        taskInput.image_url = refUrl;
        taskInput.image = refUrl;
      }
      if (input.negativePrompt) {
        taskInput.negative_prompt = input.negativePrompt;
      }

      const task = await ephone.submitTask(model, taskInput);
      return {
        jobId: task.id,
        provider: "ephone",
        modelId: model,
        status: "queued",
        estimatedCompletion: null,
        providerMetadata: task as unknown as Record<string, unknown>,
      };
    },

    async getStatus(jobId: string): Promise<VideoGenerationJob> {
      const task = await ephone.getTask(jobId);
      const statusMap: Record<string, VideoGenerationJob["status"]> = {
        queued: "queued",
        in_progress: "processing",
        completed: "completed",
        failed: "failed",
      };
      return {
        jobId,
        provider: "ephone",
        modelId: "",
        status: statusMap[task.status] ?? "processing",
        estimatedCompletion: null,
        providerMetadata: task as unknown as Record<string, unknown>,
      };
    },

    async getResult(jobId: string): Promise<VideoGenerationOutput> {
      const task = await ephone.pollTask(jobId);
      if (task.status === "failed") {
        throw new Error(task.error ?? "ePhone video task failed");
      }
      const videos = (task.outputs ?? []).map((url) => ({
        url,
        width: 1280,
        height: 720,
        duration: 5,
        contentType: "video/mp4",
      }));
      const completedAt = new Date();
      return {
        id: jobId,
        status: "completed",
        videos,
        provider: "ephone",
        modelId: "",
        providerMetadata: task as unknown as Record<string, unknown>,
        timing: { startedAt: new Date(), completedAt, durationMs: 0 },
        cost: { providerCostUsd: 0.25, creditCost: 25 },
      };
    },

    async cancelJob(_jobId: string) {},
  };
}
