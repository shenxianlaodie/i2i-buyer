import { db } from "@/lib/db";
import { refundCredits } from "@/lib/credits";
import { runImageGeneration, runVideoGeneration } from "./run-generation";
import { runFusionImage } from "./ephone/fusion";
import { runPoseImage } from "./ephone/pose";
import { uploadImageToOSS, ossUrlThumb, ossUrlPreview } from "@/lib/oss-upload";

const DEFAULT_MAX_CONCURRENT_IMAGE = 3;
const DEFAULT_MAX_CONCURRENT_VIDEO = 1;
const GENERATION_TIMEOUT_MS = 10 * 60 * 1000; // 10 分钟超时

// 简易互斥锁，防止大量任务同时入队时并发读 DB 造成惊群
let dbLock = false;

let activeImage = 0;
let activeVideo = 0;
const imageQueue: string[] = [];
const videoQueue: string[] = [];

// 缓存并发配置，避免每次 dequeue 都查 DB
let cachedImageMax = DEFAULT_MAX_CONCURRENT_IMAGE;
let cachedVideoMax = DEFAULT_MAX_CONCURRENT_VIDEO;
let cacheTs = 0;
const CACHE_TTL_MS = 5000; // 5 秒缓存

async function getConcurrencyLimits() {
  const now = Date.now();
  if (now - cacheTs < CACHE_TTL_MS) {
    return { imageMax: cachedImageMax, videoMax: cachedVideoMax };
  }
  // 防惊群：同一时刻只允许一个 DB 读取
  if (dbLock) {
    return { imageMax: cachedImageMax, videoMax: cachedVideoMax };
  }
  dbLock = true;
  try {
    const [imgSetting, vidSetting] = await Promise.all([
      db.systemSetting.findUnique({ where: { key: "worker.maxConcurrentImage" } }),
      db.systemSetting.findUnique({ where: { key: "worker.maxConcurrentVideo" } }),
    ]);
    cachedImageMax = imgSetting ? parseInt(imgSetting.value, 10) || DEFAULT_MAX_CONCURRENT_IMAGE : DEFAULT_MAX_CONCURRENT_IMAGE;
    cachedVideoMax = vidSetting ? parseInt(vidSetting.value, 10) || DEFAULT_MAX_CONCURRENT_VIDEO : DEFAULT_MAX_CONCURRENT_VIDEO;
  } catch {
    // 读取失败保持原值
  }
  dbLock = false;
  cacheTs = now;
  return { imageMax: cachedImageMax, videoMax: cachedVideoMax };
}

/** 强制刷新并发配置缓存 */
export async function refreshConcurrencyLimits() {
  cacheTs = 0;
  return getConcurrencyLimits();
}

/** 获取当前并发配置（异步，始终读 DB/缓存最新值） */
export async function getConcurrencyConfig() {
  return getConcurrencyLimits();
}

// 启动时立即预热缓存（不阻塞导出）
getConcurrencyLimits().catch(() => {});

async function processImageJob(generationId: string) {
  const gen = await db.generation.findUnique({ where: { id: generationId } });
  if (!gen || gen.status === "COMPLETED" || gen.status === "FAILED" || gen.status === "CANCELLED") return;

  let task: Promise<unknown>;
  if (gen.fusionBatchId) {
    task = runFusionGeneration(generationId);
  } else if (gen.poseBatchId) {
    task = runPoseGeneration(generationId);
  } else {
    task = runImageGeneration(generationId);
  }

  // 10 分钟超时兜底
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("TIMEOUT")), GENERATION_TIMEOUT_MS),
  );

  try {
    await Promise.race([task, timeout]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "TIMEOUT") {
      console.error(`[worker] generation ${generationId} timed out after ${GENERATION_TIMEOUT_MS / 60000}min`);
      await db.generation.update({
        where: { id: generationId },
        data: { status: "FAILED", errorMessage: "生成超时(>10分钟)", completedAt: new Date() },
      });
      await db.asset.updateMany({
        where: { generationId, generationStatus: { in: ["QUEUED", "GENERATING"] } },
        data: { generationStatus: "FAILED" },
      }).catch(() => {});
      try {
        const { refundCredits } = await import("@/lib/credits");
        await refundCredits(gen.userId, generationId);
      } catch { /* ignore */ }
    } else {
      console.error(`[worker] image generation ${generationId} failed:`, message);
    }
  }
}

async function nextImage() {
  const { imageMax } = await getConcurrencyLimits();
  if (activeImage >= imageMax || imageQueue.length === 0) return;
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

async function nextVideo() {
  const { videoMax } = await getConcurrencyLimits();
  if (activeVideo >= videoMax || videoQueue.length === 0) return;
  const generationId = videoQueue.shift()!;
  activeVideo++;
  runVideoGeneration(generationId)
    .catch(async (err) => {
      console.error(`[worker] video generation ${generationId} failed:`, err instanceof Error ? err.message : err);
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
    image: { active: activeImage, queued: imageQueue.length, max: cachedImageMax },
    video: { active: activeVideo, queued: videoQueue.length, max: cachedVideoMax },
  };
}

/** 查询某个生成在队列中的位置（0=正在处理，>0=排队中，-1=不在队列） */
export function getImageQueuePosition(generationId: string): number {
  const idx = imageQueue.indexOf(generationId);
  return idx === -1 ? -1 : idx + 1; // 1-based: 1=下一个, 2=第二个...
}

export function getVideoQueuePosition(generationId: string): number {
  const idx = videoQueue.indexOf(generationId);
  return idx === -1 ? -1 : idx + 1;
}

/** 从队列中取消图片生成任务（仅限还在排队的，已开始处理的不行） */
export function cancelImageGeneration(generationId: string): boolean {
  const idx = imageQueue.indexOf(generationId);
  if (idx === -1) return false; // 不在队列中（可能已在处理或已完成）
  imageQueue.splice(idx, 1);
  return true;
}

/** 从队列中取消视频生成任务 */
export function cancelVideoGeneration(generationId: string): boolean {
  const idx = videoQueue.indexOf(generationId);
  if (idx === -1) return false;
  videoQueue.splice(idx, 1);
  return true;
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

  // 创建占位 Asset
  const placeholder = await db.asset.create({
    data: {
      userId: gen.userId, generationId: gen.id, type: "IMAGE",
      filename: `fusion-${gen.id}.png`, originalUrl: "",
      mimeType: "image/png", generationStatus: "GENERATING",
    },
  });

  try {
    const result = await runFusionImage({
      baseImageUrl,
      printImageUrl,
      prompt: gen.prompt,
      modelId: gen.modelId,
      aspectRatio: aspectRatio as import("@/server/ai-gateway/types").AspectRatio | undefined,
    });
    const { llmDurationMs, ossDurationMs } = result.timing;
    const totalDurationMs = llmDurationMs + ossDurationMs;

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
        outputData: { _timing: { genDurationMs: llmDurationMs, ossDurationMs, totalDurationMs } } as any,
      },
    });

    await db.fusionBatch.update({
      where: { id: gen.fusionBatchId! },
      data: { updatedAt: new Date() },
    });

    // 更新占位 Asset
    await db.asset.update({
      where: { id: placeholder.id },
      data: {
        originalUrl: result.url,
        urlThumb: ossUrlThumb(result.url),
        urlPreview: ossUrlPreview(result.url),
        mimeType: "image/png",
        generationStatus: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fusion generation failed";
    await db.generation.update({
      where: { id: generationId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    try { await db.asset.update({ where: { id: placeholder.id }, data: { generationStatus: "FAILED" } }); } catch {}
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

  const placeholder = await db.asset.create({
    data: {
      userId: gen.userId, generationId: gen.id, type: "IMAGE",
      filename: `pose-${gen.id}.png`, originalUrl: "",
      mimeType: "image/png", generationStatus: "GENERATING",
    },
  });

  try {
    const result = await runPoseImage({
      sourceImageUrl,
      poseType: poseType as import("@/lib/pose-types").PoseType,
      modelId: gen.modelId,
      aspectRatio: aspectRatio as import("@/server/ai-gateway/types").AspectRatio | undefined,
    });
    const { llmDurationMs, ossDurationMs } = result.timing;
    const totalDurationMs = llmDurationMs + ossDurationMs;

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
        outputData: { _timing: { genDurationMs: llmDurationMs, ossDurationMs, totalDurationMs } } as any,
      },
    });

    await db.poseBatch.update({
      where: { id: gen.poseBatchId! },
      data: { updatedAt: new Date() },
    });

    await db.asset.update({
      where: { id: placeholder.id },
      data: {
        originalUrl: result.url,
        urlThumb: ossUrlThumb(result.url),
        urlPreview: ossUrlPreview(result.url),
        mimeType: "image/png",
        generationStatus: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pose generation failed";
    await db.generation.update({
      where: { id: generationId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    try { await db.asset.update({ where: { id: placeholder.id }, data: { generationStatus: "FAILED" } }); } catch {}
    await refundCredits(gen.userId, generationId);
    throw err;
  }
}

export async function recoverStuckGenerations() {
  // 恢复 PENDING：重新入队
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
    console.error(`[worker] recovered ${stuck.length} stuck PENDING generations`);
  }

  // 清理 PROCESSING：上次进程被 kill 时来不及更新状态，标记为失败并退款
  const dangling = await db.generation.findMany({
    where: { status: "PROCESSING" },
    select: { id: true, userId: true, creditCost: true },
  });
  if (dangling.length > 0) {
    console.error(`[worker] cleaning up ${dangling.length} dangling PROCESSING generations`);
    for (const g of dangling) {
      await db.generation.update({
        where: { id: g.id },
        data: { status: "FAILED", errorMessage: "服务重启导致任务中断", completedAt: new Date() },
      }).catch(() => {});
      await db.asset.updateMany({
        where: { generationId: g.id, generationStatus: { in: ["QUEUED", "GENERATING"] } },
        data: { generationStatus: "FAILED" },
      }).catch(() => {});
      if (g.creditCost && g.creditCost > 0) {
        try {
          const { refundCredits } = await import("@/lib/credits");
          await refundCredits(g.userId, g.id);
        } catch { /* ignore */ }
      }
    }
  }
}

recoverStuckGenerations();
