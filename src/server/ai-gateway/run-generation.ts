import { db } from "@/lib/db";
import { refundCredits } from "@/lib/credits";
import type { ProviderId, AspectRatio } from "./types";
import { getGatewayRegistry } from "./env";

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

export async function runImageGeneration(generationId: string) {
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

  try {
    if (!("generate" in gateway)) {
      throw new Error(`Provider ${provider} requires async image gateway (not yet wired)`);
    }
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

    const outputUrls = result.images.map((img) => img.url);
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

    for (const img of result.images) {
      await db.asset.create({
        data: {
          userId: gen.userId,
          projectId: gen.projectId,
          generationId: gen.id,
          type: "IMAGE",
          filename: `gen-${gen.id}.png`,
          originalUrl: img.url,
          mimeType: img.contentType,
          width: img.width,
          height: img.height,
        },
      });
    }

    return { generationId, outputUrls };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    await db.generation.update({
      where: { id: generationId },
      data: {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    await refundCredits(gen.userId, generationId);
    throw err;
  }
}

export async function runVideoGeneration(generationId: string) {
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

  try {
    const job = await gateway.submit({
      prompt: gen.prompt,
      negativePrompt: gen.negativePrompt ?? undefined,
      modelId: gen.modelId,
      provider,
      aspectRatio: params.aspectRatio,
      duration: params.duration,
      seed: params.seed,
      referenceImage: gen.referenceImage
        ? { url: gen.referenceImage }
        : undefined,
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

    for (const video of result.videos) {
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

    return { generationId, outputUrls };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    await db.generation.update({
      where: { id: generationId },
      data: {
        status: "FAILED",
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    await refundCredits(gen.userId, generationId);
    throw err;
  }
}
