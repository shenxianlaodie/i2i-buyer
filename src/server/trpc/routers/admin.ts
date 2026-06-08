import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, superAdminProcedure, protectedProcedure } from "@/server/trpc/init";
import { db } from "@/lib/db";
import { grantCredits, setUserCredits } from "@/lib/credits";
import {
  getPromptSettings,
  savePromptSettings,
  getModelSettings,
  saveModelSettings,
} from "@/lib/system-settings";
import { POSE_TYPES } from "@/lib/pose-types";
import { isAdminOrManager } from "@/lib/auth-user";

// CPU 差值计算缓存：process.cpuUsage() 返回距上次调用的差值
let prevCpuUsage: { user: number; system: number } | null = null;
let prevCpuTime = 0;

// 静态系统信息缓存（只读一次）
let _cpuModel = "";
let _cpuCores = 0;
function getCpuInfo() {
  if (!_cpuModel) {
    const os = require("os");
    const cpus = os.cpus();
    _cpuModel = cpus[0]?.model ?? "Unknown";
    _cpuCores = cpus.length;
  }
  return { model: _cpuModel, cores: _cpuCores };
}

export const adminRouter = router({
  isAdmin: protectedProcedure.query(async ({ ctx }) => {
    return { isAdmin: isAdminOrManager((ctx as any).userRole) };
  }),

  listUsers: adminProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          limit: z.number().min(1).max(100).default(50),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const search = input?.search?.trim();
      const users = await db.user.findMany({
        where: search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
              ],
            }
          : undefined,
        orderBy: { createdAt: "desc" },
        take: input?.limit ?? 50,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          disabled: true,
          credits: true,
          createdAt: true,
          _count: {
            select: {
              generations: true,
              fusionBatches: true,
              poseBatches: true,
            },
          },
        },
      });
      return users;
    }),

  setUserDisabled: adminProcedure
    .input(z.object({ userId: z.string(), disabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId && input.disabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "不能禁用当前登录账户",
        });
      }
      return db.user.update({
        where: { id: input.userId },
        data: { disabled: input.disabled },
        select: { id: true, disabled: true },
      });
    }),

  /** 调整用户角色：仅超级管理员可操作 */
  setUserRole: superAdminProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(["USER", "MANAGER", "ADMIN"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "不能修改自己的角色",
        });
      }
      return db.user.update({
        where: { id: input.userId },
        data: { role: input.role },
        select: { id: true, role: true, name: true, email: true },
      });
    }),

  grantCredits: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        amount: z.number().int().positive(),
      }),
    )
    .mutation(async ({ input }) => {
      const balance = await grantCredits(
        input.userId,
        input.amount,
        "管理员发放配额",
      );
      return { balance };
    }),

  setCredits: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        credits: z.number().int().min(0),
      }),
    )
    .mutation(async ({ input }) => {
      const balance = await setUserCredits(
        input.userId,
        input.credits,
        "管理员设置配额",
      );
      return { balance };
    }),

  getUserUsage: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const user = await db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          email: true,
          name: true,
          credits: true,
          createdAt: true,
        },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const [
        generationStats,
        creditConsumed,
        recentTransactions,
        fusionCount,
        poseCount,
      ] = await Promise.all([
        db.generation.groupBy({
          by: ["status"],
          where: { userId: input.userId },
          _count: true,
        }),
        db.creditTransaction.aggregate({
          where: { userId: input.userId, type: "CONSUME" },
          _sum: { amount: true },
        }),
        db.creditTransaction.findMany({
          where: { userId: input.userId },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        db.fusionBatch.count({ where: { userId: input.userId } }),
        db.poseBatch.count({ where: { userId: input.userId } }),
      ]);

      return {
        user,
        generationStats,
        totalConsumed: Math.abs(creditConsumed._sum.amount ?? 0),
        fusionBatchCount: fusionCount,
        poseBatchCount: poseCount,
        recentTransactions,
      };
    }),

  getUserTasks: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const [fusionBatches, poseBatches, activeGenerations] =
        await Promise.all([
          db.fusionBatch.findMany({
            where: { userId: input.userId },
            orderBy: { updatedAt: "desc" },
            take: 10,
            include: { _count: { select: { rows: true } } },
          }),
          db.poseBatch.findMany({
            where: { userId: input.userId },
            orderBy: { updatedAt: "desc" },
            take: 10,
            include: { _count: { select: { rows: true } } },
          }),
          db.generation.findMany({
            where: {
              userId: input.userId,
              status: { in: ["PENDING", "QUEUED", "PROCESSING"] },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              type: true,
              status: true,
              modelId: true,
              prompt: true,
              poseType: true,
              fusionBatchId: true,
              poseBatchId: true,
              createdAt: true,
            },
          }),
        ]);

      return { fusionBatches, poseBatches, activeGenerations };
    }),

  getPromptSettings: adminProcedure.query(async () => getPromptSettings()),

  updatePromptSettings: adminProcedure
    .input(
      z.object({
        pose: z.record(z.enum(POSE_TYPES), z.string().min(1)),
        productTitle: z.string().min(1),
        productDescription: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      await savePromptSettings(input);
      return { success: true };
    }),

  getModelSettings: protectedProcedure.query(async () => getModelSettings()),

  updateModelSettings: adminProcedure
    .input(
      z.object({
        imageModelId: z.string().min(1),
        videoModelId: z.string().min(1),
        textModelId: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      await saveModelSettings(input);
      return { success: true };
    }),

  getCleanupLogs: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(20).default(5) }))
    .query(async ({ input }) => {
      return db.cleanupLog.findMany({
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  /** 活跃任务队列 */
  getActiveTasks: adminProcedure.query(async () => {
    const tasks = await db.generation.findMany({
      where: { status: { in: ["PENDING", "QUEUED", "PROCESSING"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, status: true, type: true, modelId: true,
        prompt: true, createdAt: true, startedAt: true, completedAt: true,
        duration: true, errorMessage: true,
        fusionBatchId: true, poseBatchId: true,
        outputData: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return tasks.map((t) => {
      const start = t.startedAt ?? t.createdAt;
      const elapsed = Math.floor((Date.now() - new Date(start).getTime()) / 1000);
      const timing = (t.outputData as any)?._timing;
      return {
        id: t.id,
        status: t.status,
        type: t.type,
        modelId: t.modelId,
        prompt: t.prompt?.substring(0, 60) ?? "",
        elapsed,
        duration: t.duration,
        genDurationMs: timing?.genDurationMs ?? null,
        ossDurationMs: timing?.ossDurationMs ?? null,
        createdAt: t.createdAt,
        user: t.user,
        fusionBatchId: t.fusionBatchId,
        poseBatchId: t.poseBatchId,
        errorMessage: t.errorMessage,
      };
    });
  }),

  /** 取消任务 */
  cancelTask: adminProcedure
    .input(z.object({ generationId: z.string() }))
    .mutation(async ({ input }) => {
      const g = await db.generation.findUnique({ where: { id: input.generationId } });
      if (!g) throw new TRPCError({ code: "NOT_FOUND" });
      if (g.status === "COMPLETED" || g.status === "FAILED" || g.status === "CANCELLED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "任务已完成，无法取消" });
      }
      await db.generation.update({
        where: { id: input.generationId },
        data: { status: "CANCELLED", errorMessage: "管理员手动取消", completedAt: new Date() },
      });
      // 退款
      if (g.creditCost && g.creditCost > 0) {
        await db.user.update({
          where: { id: g.userId },
          data: { credits: { increment: g.creditCost } },
        });
      }
      return { success: true };
    }),

  /** 任务日志（最近完成/失败的任务，含耗时明细） */
  getTaskLogs: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const tasks = await db.generation.findMany({
        where: { status: { in: ["COMPLETED", "FAILED", "CANCELLED"] } },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        select: {
          id: true, status: true, type: true, modelId: true,
          prompt: true, params: true, createdAt: true, startedAt: true, completedAt: true,
          duration: true, errorMessage: true, outputData: true,
          fusionBatchId: true, poseBatchId: true,
          user: { select: { id: true, name: true, email: true } },
        },
      });

      return tasks.map((t) => {
        const start = t.startedAt ? new Date(t.startedAt).getTime() : null;
        const end = t.completedAt ? new Date(t.completedAt).getTime() : null;
        const wallMs = (start && end) ? end - start : null;
        const timing = (t.outputData as any)?._timing;
        const source = t.fusionBatchId ? "融合图" : t.poseBatchId ? "多姿势" : "画板";
        const queuedMs = (start && t.createdAt) ? start - new Date(t.createdAt).getTime() : null;
        const p = (t.params as Record<string, unknown>) ?? {};
        return {
          id: t.id,
          status: t.status,
          type: t.type,
          source,
          modelId: t.modelId,
          prompt: t.prompt?.substring(0, 60) ?? "",
          params: {
            duration: p.duration ?? null,
            mode: p.mode ?? null,
            sound: p.sound ?? null,
            aspectRatio: p.aspectRatio ?? null,
          },
          createdAt: t.createdAt,
          startedAt: t.startedAt,
          wallMs,
          wallSec: wallMs ? (wallMs / 1000).toFixed(1) : null,
          queuedMs,
          queuedSec: queuedMs ? (queuedMs / 1000).toFixed(1) : null,
          apiDurationMs: t.duration,
          genDurationMs: timing?.genDurationMs ?? null,
          ossDurationMs: timing?.ossDurationMs ?? null,
          totalDurationMs: timing?.totalDurationMs ?? wallMs,
          user: t.user,
          errorMessage: t.errorMessage,
        };
      });
    }),

  // ═══════════════════════════════════════════════════════
  // 性能监测 —— 并发控制 + 服务器指标
  // ═══════════════════════════════════════════════════════

  /** 获取 Worker 并发配置 + 实时队列状态 */
  getWorkerConfig: adminProcedure.query(async () => {
    const { getWorkerStats, getConcurrencyConfig } = await import("@/server/ai-gateway/worker");
    const stats = getWorkerStats();
    const config = await getConcurrencyConfig();
    return { stats, config };
  }),

  /** 更新 Worker 并发上限（写入 SystemSetting 并立即生效） */
  updateWorkerConfig: adminProcedure
    .input(
      z.object({
        imageMax: z.number().int().min(1).max(50),
        videoMax: z.number().int().min(1).max(20),
      }),
    )
    .mutation(async ({ input }) => {
      await db.systemSetting.upsert({
        where: { key: "worker.maxConcurrentImage" },
        update: { value: String(input.imageMax) },
        create: { key: "worker.maxConcurrentImage", value: String(input.imageMax) },
      });
      await db.systemSetting.upsert({
        where: { key: "worker.maxConcurrentVideo" },
        update: { value: String(input.videoMax) },
        create: { key: "worker.maxConcurrentVideo", value: String(input.videoMax) },
      });
      // 立即刷新缓存
      const { refreshConcurrencyLimits } = await import("@/server/ai-gateway/worker");
      await refreshConcurrencyLimits();
      return { success: true, imageMax: input.imageMax, videoMax: input.videoMax };
    }),

  /** 获取服务器实时指标 */
  getServerMetrics: adminProcedure.query(async () => {
    const os = await import("os");
    const v8 = await import("v8");

    const { model: cpuModel, cores: cpuCores } = getCpuInfo();

    // 瞬时 CPU：基于 process.cpuUsage() 两次调用差值计算
    let processCpuPercent = 0;
    const now = Date.now();
    const cpuUsage = process.cpuUsage(); // { user, system } µs 差值
    if (prevCpuUsage && prevCpuTime > 0) {
      const timeDeltaMs = now - prevCpuTime;
      const cpuDeltaUs = cpuUsage.user + cpuUsage.system; // µs
      // CPU% = (CPU 时间 µs / 真实时间 µs / 核数) * 100
      if (timeDeltaMs > 0) {
        processCpuPercent = Math.round(
          (cpuDeltaUs / (timeDeltaMs * 1000) / cpuCores) * 10000,
        ) / 100;
        // 限制在 0-100 范围
        processCpuPercent = Math.max(0, Math.min(100, processCpuPercent));
      }
    }
    prevCpuUsage = { user: cpuUsage.user, system: cpuUsage.system };
    prevCpuTime = now;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPercent = Math.round((usedMem / totalMem) * 10000) / 100;

    const procMem = process.memoryUsage();
    const heapUsedMB = Math.round((procMem.heapUsed / 1024 / 1024) * 100) / 100;
    const heapTotalMB = Math.round((procMem.heapTotal / 1024 / 1024) * 100) / 100;
    const rssMB = Math.round((procMem.rss / 1024 / 1024) * 100) / 100;

    const heapStats = v8.getHeapStatistics();
    const heapUsedPercent = Math.round((heapStats.used_heap_size / heapStats.heap_size_limit) * 10000) / 100;

    const loadAvg = os.loadavg();
    const sysUptimeSec = os.uptime();
    const processUptimeSec = process.uptime();

    return {
      cpu: { model: cpuModel, cores: cpuCores, processPercent: processCpuPercent },
      memory: {
        totalMB: Math.round(totalMem / 1024 / 1024),
        usedMB: Math.round(usedMem / 1024 / 1024),
        freeMB: Math.round(freeMem / 1024 / 1024),
        percent: memPercent,
      },
      process: {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        heapUsedPercent,
        uptimeSec: Math.round(processUptimeSec),
      },
      loadAvg: {
        "1min": Math.round(loadAvg[0] * 100) / 100,
        "5min": Math.round(loadAvg[1] * 100) / 100,
        "15min": Math.round(loadAvg[2] * 100) / 100,
      },
      systemUptimeSec: Math.round(sysUptimeSec),
      timestamp: Date.now(),
    };
  }),
});
