import type {
  VideoGenerationGateway,
  VideoGenerationInput,
  VideoGenerationJob,
  VideoGenerationOutput,
} from "../types";
import { KlingClient } from "./kling";
import { resolveUrl } from "./resolve-url";

export function createKlingVideoGateway(apiKey: string): VideoGenerationGateway {
  const kling = new KlingClient(apiKey);

  return {
    async submit(input: VideoGenerationInput): Promise<VideoGenerationJob> {
      if (!input.modelId) throw new Error("请选择视频模型");

      const rawRefUrl =
        input.referenceImage?.url ?? input.startFrameUrl ?? undefined;
      const imageUrl = rawRefUrl ? resolveUrl(rawRefUrl) : undefined;

      const result = await kling.createImageToVideo({
        modelName: input.modelId,
        prompt: input.prompt,
        imageUrl: imageUrl ?? "",
        duration: String(input.duration ?? 5),
        mode: input.mode ?? "pro",
        aspectRatio: input.aspectRatio ?? "16:9",
        sound: input.sound ? "on" : "off",
      });

      return {
        jobId: result.data.task_id,
        provider: "kling",
        modelId: input.modelId,
        status: "queued",
        estimatedCompletion: null,
        providerMetadata: result as unknown as Record<string, unknown>,
      };
    },

    async getStatus(jobId: string): Promise<VideoGenerationJob> {
      const task = await kling.getTask(jobId);
      const statusMap: Record<string, VideoGenerationJob["status"]> = {
        submitted: "queued",
        processing: "processing",
        succeed: "completed",
        failed: "failed",
      };
      return {
        jobId,
        provider: "kling",
        modelId: "",
        status: statusMap[task.data.task_status] ?? "processing",
        estimatedCompletion: null,
        providerMetadata: task as unknown as Record<string, unknown>,
      };
    },

    async getResult(jobId: string): Promise<VideoGenerationOutput> {
      const task = await kling.pollTask(jobId);
      if (task.data.task_status === "failed") {
        throw new Error(task.data.task_status_msg ?? "Kling video task failed");
      }
      const videos = (task.data.task_result?.videos ?? []).map((v) => ({
        url: v.url,
        width: 1280,
        height: 720,
        duration: parseFloat(v.duration) || 5,
        contentType: "video/mp4",
      }));
      const completedAt = new Date();
      return {
        id: jobId,
        status: "completed",
        videos,
        provider: "kling",
        modelId: "",
        providerMetadata: task as unknown as Record<string, unknown>,
        timing: { startedAt: new Date(), completedAt, durationMs: 0 },
        cost: { providerCostUsd: 0.25, creditCost: 25 },
      };
    },

    async cancelJob(_jobId: string) {},
  };
}
