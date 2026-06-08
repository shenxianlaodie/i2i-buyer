import type {
  VideoGenerationGateway,
  VideoGenerationInput,
  VideoGenerationJob,
  VideoGenerationOutput,
} from "../types";
import { TuziClient } from "./tuzi-client";

/** 存储 veo 同步结果，供 getResult 直接返回 */
const veoResultCache = new Map<string, VideoGenerationOutput>();

function isVeoModel(modelId: string): boolean {
  return modelId.toLowerCase().startsWith("veo");
}

export function createTuziVideoGateway(apiKey: string): VideoGenerationGateway {
  const tuzi = new TuziClient(apiKey);

  return {
    async submit(input: VideoGenerationInput): Promise<VideoGenerationJob> {
      if (!input.modelId) throw new Error("请选择视频模型");

      const refUrl =
        input.referenceImage?.url ?? input.startFrameUrl ?? undefined;

      // ── Veo 模型：走 chat completions（同步） ──
      if (isVeoModel(input.modelId)) {
        const chatResult = await tuzi.createChatVideo({
          model: input.modelId,
          prompt: input.prompt,
          imageUrl: refUrl,
        });

        // 尝试从多个位置提取视频 URL
        const videoUrl =
          chatResult.video_url
          ?? chatResult.choices?.[0]?.message?.content?.trim()
          ?? "";

        if (!videoUrl) {
          throw new Error(
            `Veo 视频生成失败：无法从响应中提取视频 URL。原始响应: ${JSON.stringify(chatResult)}`,
          );
        }

        const jobId = chatResult.id || `veo-${Date.now()}`;
        const output: VideoGenerationOutput = {
          id: jobId,
          status: "completed",
          videos: [
            {
              url: videoUrl,
              width: 1920,
              height: 1080,
              duration: 8,
              contentType: "video/mp4",
            },
          ],
          provider: "tuzi",
          modelId: input.modelId,
          providerMetadata: chatResult as unknown as Record<string, unknown>,
          timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 },
          cost: { providerCostUsd: 0.3, creditCost: 30 },
        };

        veoResultCache.set(jobId, output);

        return {
          jobId,
          provider: "tuzi",
          modelId: input.modelId,
          status: "completed",
          estimatedCompletion: null,
          providerMetadata: chatResult as unknown as Record<string, unknown>,
        };
      }

      // ── Sora-2：走 /v1/videos（异步轮询） ──
      const size = input.size
        ?? (input.aspectRatio === "9:16" ? "720x1280"
          : input.aspectRatio === "16:9" ? "1280x720"
          : "1280x720");

      const result = await tuzi.createVideo({
        prompt: input.prompt,
        imageUrl: refUrl,
        seconds: input.duration != null ? String(input.duration) : undefined,
        size,
      });

      return {
        jobId: result.id,
        provider: "tuzi",
        modelId: input.modelId,
        status: "queued",
        estimatedCompletion: null,
        providerMetadata: result as unknown as Record<string, unknown>,
      };
    },

    async getStatus(jobId: string): Promise<VideoGenerationJob> {
      // Veo 同步结果
      if (veoResultCache.has(jobId)) {
        const output = veoResultCache.get(jobId)!;
        return {
          jobId,
          provider: "tuzi",
          modelId: output.modelId,
          status: output.status === "completed" ? "completed" : "failed",
          estimatedCompletion: null,
          providerMetadata: output.providerMetadata,
        };
      }

      // Sora-2 异步轮询
      const video = await tuzi.getVideo(jobId);
      const statusMap: Record<string, VideoGenerationJob["status"]> = {
        queued: "queued",
        in_progress: "processing",
        completed: "completed",
        failed: "failed",
      };
      return {
        jobId,
        provider: "tuzi",
        modelId: "",
        status: statusMap[video.status] ?? "processing",
        estimatedCompletion: null,
        providerMetadata: video as unknown as Record<string, unknown>,
      };
    },

    async getResult(jobId: string): Promise<VideoGenerationOutput> {
      // Veo 同步结果：从缓存直接返回
      const cached = veoResultCache.get(jobId);
      if (cached) {
        veoResultCache.delete(jobId); // 清理
        return cached;
      }

      // Sora-2 异步轮询
      const video = await tuzi.pollVideo(jobId);
      if (video.status === "failed") {
        throw new Error(video.error ?? "Tuzi video task failed");
      }
      const videos = video.video_url
        ? [
            {
              url: video.video_url,
              width: 1280,
              height: 720,
              duration: parseInt(video.seconds) || 5,
              contentType: "video/mp4",
            },
          ]
        : [];
      const completedAt = new Date();
      return {
        id: jobId,
        status: "completed",
        videos,
        provider: "tuzi",
        modelId: "",
        providerMetadata: video as unknown as Record<string, unknown>,
        timing: { startedAt: new Date(), completedAt, durationMs: 0 },
        cost: { providerCostUsd: 0.2, creditCost: 20 },
      };
    },

    async cancelJob(_jobId: string) {},
  };
}
