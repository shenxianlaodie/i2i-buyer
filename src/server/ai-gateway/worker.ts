import { db } from "@/lib/db";
import { refundCredits } from "@/lib/credits";
import { runImageGeneration, runVideoGeneration } from "./run-generation";
import { runFusionImage } from "./ephone/fusion";
import { runPoseImage } from "./ephone/pose";

const MAX_CONCURRENT_IMAGE = 5;
const MAX_CONCURRENT_VIDEO = 2;

let activeImage = 0;
let activeVideo = 0;
const imageQueue: string[] = [];
const videoQueue: string[] = [];

async function processImageJob(generationId: string) {
  const gen = await db.generation.findUnique({ where: { id: generationId } });
  if (!gen || gen.status === "COMPLETED" || gen.status === "FAILED" || gen.status === "CANCELLED") return;

  if (gen.fusionBatchId) {
    return runFusionGeneration(generationId);
  }
  if (gen.poseBatchId) {
    return runPoseGeneration(generationId);
  }
  return runImageGeneration(generationId);
}

function nextImage() {
  if (activeImage >= MAX_CONCURRENT_IMAGE || imageQueue.length === 0) return;
  const generationId = imageQueue.shift()!;
  activeImage++;
  processImageJob(generationId)
    .catch((err) => {
      console.error(`[worker] image generation ${generationId} failed:`, err.message);
    })
    .finally(() => {
      activeImage--;
      nextImage();
    });
}

function nextVideo() {
  if (activeVideo >= MAX_CONCURRENT_VIDEO || videoQueue.length === 0) return;
  const generationId = videoQueue.shift()!;
  activeVideo++;
  runVideoGeneration(generationId)
    .catch((err) => {
      console.error(`[worker] video generation ${generationId} failed:`, err.message);
    })
    .finally(() => {
      activeVideo--;
      nextVideo();
    });
}

export function enqueueImage(generationId: string) {
  imageQueue.push(generationId);
  nextImage();
}

export function enqueueVideo(generationId: string) {
  videoQueue.push(generationId);
  nextVideo();
}

export function getWorkerStats() {
  return {
    image: { active: activeImage, queued: imageQueue.length, max: MAX_CONCURRENT_IMAGE },
    video: { active: activeVideo, queued: videoQueue.length, max: MAX_CONCURRENT_VIDEO },
  };
}

async function runFusionGeneration(generationId: string) {
  const gen = await db.generation.findUnique({ where: { id: generationId } });
  if (!gen) return;

  const params = (gen.params as Record<string, unknown>) ?? {};
  const baseImageUrl = params.baseImageUrl as string;
  const printImageUrl = params.printImageUrl as string;
  const aspectRatio = params.aspectRatio as string | undefined;
  const rowId = gen.fusionRowId!;

  if (!baseImageUrl || !printImageUrl) {
    throw new Error(`Fusion generation ${generationId} missing baseImageUrl or printImageUrl`);
  }

  await db.generation.update({
    where: { id: generationId },
    data: { status: "PROCESSING", startedAt: new Date() },
  });

  try {
    const result = await runFusionImage({
      baseImageUrl,
      printImageUrl,
      prompt: gen.prompt,
      modelId: gen.modelId,
      aspectRatio: aspectRatio as import("@/server/ai-gateway/types").AspectRatio | undefined,
    });

    const version = await db.fusionVersion.create({
      data: {
        rowId,
        prompt: gen.prompt,
        outputUrl: result.url,
        generationId,
      },
    });

    await db.fusionRow.update({
      where: { id: rowId },
      data: { activeVersionId: version.id },
    });

    await db.generation.update({
      where: { id: generationId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        outputUrls: [result.url],
      },
    });

    await db.fusionBatch.update({
      where: { id: gen.fusionBatchId! },
      data: { updatedAt: new Date() },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fusion generation failed";
    await db.generation.update({
      where: { id: generationId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    await refundCredits(gen.userId, generationId);
    throw err;
  }
}

async function runPoseGeneration(generationId: string) {
  const gen = await db.generation.findUnique({ where: { id: generationId } });
  if (!gen) return;

  const params = (gen.params as Record<string, unknown>) ?? {};
  const sourceImageUrl = params.sourceImageUrl as string;
  const poseType = params.poseType as string;
  const aspectRatio = params.aspectRatio as string | undefined;
  const rowId = gen.poseRowId!;

  if (!sourceImageUrl || !poseType) {
    throw new Error(`Pose generation ${generationId} missing sourceImageUrl or poseType`);
  }

  await db.generation.update({
    where: { id: generationId },
    data: { status: "PROCESSING", startedAt: new Date() },
  });

  try {
    const result = await runPoseImage({
      sourceImageUrl,
      poseType: poseType as import("@/lib/pose-types").PoseType,
      modelId: gen.modelId,
      aspectRatio: aspectRatio as import("@/server/ai-gateway/types").AspectRatio | undefined,
    });

    const slot = await db.poseOutput.upsert({
      where: { rowId_poseType: { rowId, poseType } },
      create: { rowId, poseType },
      update: {},
    });

    const version = await db.poseOutputVersion.create({
      data: { outputId: slot.id, outputUrl: result.url, generationId },
    });

    await db.poseOutput.update({
      where: { id: slot.id },
      data: { outputUrl: result.url, generationId, activeVersionId: version.id },
    });

    await db.generation.update({
      where: { id: generationId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        outputUrls: [result.url],
      },
    });

    await db.poseBatch.update({
      where: { id: gen.poseBatchId! },
      data: { updatedAt: new Date() },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pose generation failed";
    await db.generation.update({
      where: { id: generationId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    await refundCredits(gen.userId, generationId);
    throw err;
  }
}

export async function recoverStuckGenerations() {
  const stuck = await db.generation.findMany({
    where: { status: "PENDING" },
    select: { id: true, type: true },
    orderBy: { createdAt: "asc" },
  });
  for (const g of stuck) {
    if (g.type === "VIDEO") {
      enqueueVideo(g.id);
    } else {
      enqueueImage(g.id);
    }
  }
  if (stuck.length > 0) {
    console.error(`[worker] recovered ${stuck.length} stuck generations`);
  }
}

recoverStuckGenerations();
