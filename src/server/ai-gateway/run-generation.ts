import { db } from "@/lib/db";
import { refundCredits } from "@/lib/credits";
import type { ProviderId, AspectRatio } from "./types";
import { getGatewayRegistry } from "./env";
import { uploadImageToOSS, ossUrlThumb, ossUrlPreview } from "@/lib/oss-upload";
import type { Prisma } from "@prisma/client";

function toProviderId(raw: string): ProviderId {
  return raw.toLowerCase() as ProviderId;
}

function parseParams(params: unknown): {
  aspectRatio?: AspectRatio;
  numOutputs?: number;
  seed?: number;
  guidanceScale?: number;
  steps?: number;
  duration?: number;
  strength?: number;
} {
  if (!params || typeof params !== "object") return {};
  return params as ReturnType<typeof parseParams>;
}

export async function runImageGeneration(generationId: string, signal?: AbortSignal) {
  const gen = await db.generation.findUnique({ where: { id: generationId } });
  if (!gen) throw new Error(`Generation ${generationId} not found`);

  const registry = getGatewayRegistry();
  const provider = toProviderId(gen.provider);
  const gateway = registry.getImageGateway(provider);
  const params = parseParams(gen.params);

  await db.generation.update({
    where: { id: generationId },
    data: { status: "PROCESSING", startedAt: new Date() },
  });

  // 查找占位 Asset（创建时为 QUEUED，此处转为 GENERATING）
  let placeholder = await db.asset.findFirst({
    where: { generationId: gen.id, generationStatus: { in: ["QUEUED", "GENERATING"] } },
  });
  if (placeholder && placeholder.generationStatus === "QUEUED") {
    await db.asset.update({
      where: { id: placeholder.id },
      data: { generationStatus: "GENERATING" },
    });
    placeholder = { ...placeholder, generationStatus: "GENERATING" };
  }
  if (!placeholder) {
    placeholder = await db.asset.create({
      data: {
        userId: gen.userId,
        projectId: gen.projectId,
        generationId: gen.id,
        type: "IMAGE",
        filename: `gen-${gen.id}.png`,
        originalUrl: "",
        mimeType: "image/png",
        generationStatus: "GENERATING",
      },
    });
  }

  try {
    if (!("generate" in gateway)) {
      throw new Error(`Provider ${provider} requires async image gateway (not yet wired)`);
    }
    const genStart = Date.now();
    const result = await gateway.generate({
      prompt: gen.prompt,
      negativePrompt: gen.negativePrompt ?? undefined,
      modelId: gen.modelId,
      provider,
      aspectRatio: params.aspectRatio,
      numOutputs: params.numOutputs,
      seed: params.seed,
      guidanceScale: params.guidanceScale,
      steps: params.steps,
      strength: params.strength,
      referenceImage: gen.referenceImage
        ? { url: gen.referenceImage }
        : undefined,
    });
    const genDurationMs = Date.now() - genStart;

    // 上传每张图片到 OSS，获取永久 URL
    const ossStart = Date.now();
    const ossResults = await Promise.all(
      result.images.map((img) =>
        uploadImageToOSS(img.url).catch((err) => {
          console.error(`[run-generation] OSS upload failed, falling back to original URL:`, err.message);
          return null;
        }),
      ),
    );
    const ossDurationMs = Date.now() - ossStart;

    const outputUrls = result.images.map((img, i) => ossResults[i]?.url ?? img.url);
    await db.generation.update({
      where: { id: generationId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        outputUrls,
        outputData: {
          ...JSON.parse(JSON.stringify(result)),
          _timing: { genDurationMs, ossDurationMs, totalDurationMs: genDurationMs + ossDurationMs },
        } as Prisma.InputJsonValue,
        duration: result.timing.durationMs,
      },
    });

    for (let i = 0; i < result.images.length; i++) {
      const img = result.images[i];
      const oss = ossResults[i];
      const originalUrl = oss?.url ?? img.url;
      if (i === 0) {
        // 更新占位 Asset
        await db.asset.update({
          where: { id: placeholder.id },
          data: {
            originalUrl,
            urlThumb: ossUrlThumb(originalUrl),
            urlPreview: ossUrlPreview(originalUrl),
            blurHash: oss?.blurHash ?? undefined,
            width: oss?.width ?? img.width ?? null,
            height: oss?.height ?? img.height ?? null,
            mimeType: img.contentType,
            generationStatus: null,
          },
        });
      } else {
        await db.asset.create({
          data: {
            userId: gen.userId,
            projectId: gen.projectId,
            generationId: gen.id,
            type: "IMAGE",
            filename: `gen-${gen.id}.png`,
            originalUrl,
            urlThumb: ossUrlThumb(originalUrl),
            urlPreview: ossUrlPreview(originalUrl),
            blurHash: oss?.blurHash ?? undefined,
            width: oss?.width ?? img.width ?? null,
            height: oss?.height ?? img.height ?? null,
            mimeType: img.contentType,
            inLibrary: false,
          },
        });
      }
    }

    return { generationId, outputUrls };
  } catch (err) {
    // 如果是因为超时被 AbortController 中止，外层已处理 DB，这里不覆盖
    if (err instanceof DOMException && err.name === "AbortError") return;
    if (signal?.aborted) return;

    const message = err instanceof Error ? err.message : "Generation failed";
    await db.generation.update({
      where: { id: generationId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    // 标记占位 Asset 为失败
    try { await db.asset.update({ where: { id: placeholder.id }, data: { generationStatus: "FAILED" } }); } catch {}
    await refundCredits(gen.userId, generationId);
    throw err;
  }
}

export async function runVideoGeneration(generationId: string, signal?: AbortSignal) {
  const gen = await db.generation.findUnique({ where: { id: generationId } });
  if (!gen) throw new Error(`Generation ${generationId} not found`);

  const registry = getGatewayRegistry();
  const provider = toProviderId(gen.provider);
  const gateway = registry.getVideoGateway(provider);
  const params = parseParams(gen.params);

  await db.generation.update({
    where: { id: generationId },
    data: { status: "QUEUED" },
  });

  // 查找或创建占位 Asset（mutation 已预先创建，这里做幂等兜底）
  let placeholder = await db.asset.findFirst({
    where: { generationId: gen.id, generationStatus: "GENERATING" },
  });
  if (!placeholder) {
    placeholder = await db.asset.create({
      data: {
        userId: gen.userId,
        projectId: gen.projectId,
        generationId: gen.id,
        type: "VIDEO",
        filename: `gen-${gen.id}.mp4`,
        originalUrl: "",
        mimeType: "video/mp4",
        generationStatus: "GENERATING",
      },
    });
  }

  try {
    const job = await gateway.submit({
      prompt: gen.prompt,
      negativePrompt: gen.negativePrompt ?? undefined,
      modelId: gen.modelId,
      provider,
      aspectRatio: params.aspectRatio,
      duration: params.duration,
      size: (gen.params as Record<string, unknown>)?.size as string | undefined,
      seed: params.seed,
      referenceImage: gen.referenceImage
        ? { url: gen.referenceImage }
        : undefined,
      mode: (gen.params as Record<string, unknown>)?.mode as "std" | "pro" | "4k" | undefined,
      sound: (gen.params as Record<string, unknown>)?.sound === "on",
    });

    await db.generation.update({
      where: { id: generationId },
      data: { status: "PROCESSING", startedAt: new Date() },
    });

    const result = await gateway.getResult(job.jobId);
    const outputUrls = result.videos.map((v) => v.url);

    await db.generation.update({
      where: { id: generationId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        outputUrls,
        outputData: JSON.parse(JSON.stringify(result)),
        duration: result.timing.durationMs,
      },
    });

    for (let i = 0; i < result.videos.length; i++) {
      const video = result.videos[i];
      if (i === 0 && placeholder) {
        // 更新占位 Asset
        await db.asset.update({
          where: { id: placeholder.id },
          data: {
            originalUrl: video.url,
            thumbnailUrl: video.thumbnailUrl,
            mimeType: video.contentType,
            width: video.width,
            height: video.height,
            duration: video.duration,
            generationStatus: null,
          },
        });
      } else {
        await db.asset.create({
          data: {
            userId: gen.userId,
            projectId: gen.projectId,
            generationId: gen.id,
            type: "VIDEO",
            filename: `gen-${gen.id}.mp4`,
            originalUrl: video.url,
            thumbnailUrl: video.thumbnailUrl,
            mimeType: video.contentType,
            width: video.width,
            height: video.height,
            duration: video.duration,
          },
        });
      }
    }

    return { generationId, outputUrls };
  } catch (err) {
    // 如果是因为超时被 AbortController 中止，外层已处理 DB，这里不覆盖
    if (err instanceof DOMException && err.name === "AbortError") return;
    if (signal?.aborted) return;

    const message = err instanceof Error ? err.message : "Generation failed";
    await db.generation.update({
      where: { id: generationId },
      data: {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    // 标记占位 Asset 为失败
    try { await db.asset.update({ where: { id: placeholder.id }, data: { generationStatus: "FAILED" } }); } catch {}
    await refundCredits(gen.userId, generationId);
    throw err;
  }
}
