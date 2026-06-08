import { inngest } from "../client";
import { db } from "@/lib/db";
import { refundCredits } from "@/lib/credits";

/**
 * 定时清理卡住的生成任务。
 * 每 5 分钟执行一次，将超过 10 分钟仍在 GENERATING 的 Asset 标记为 FAILED。
 */
export const cleanupStuckGenerations = inngest.createFunction(
  {
    id: "cleanup-stuck-generations",
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }: { step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    const cutoff = new Date(Date.now() - 10 * 60 * 1000); // 10 分钟

    const stuckAssets = await step.run("find-stuck-assets", async () => {
      return db.asset.findMany({
        where: {
          generationStatus: "GENERATING",
          createdAt: { lt: cutoff },
        },
        select: { id: true, generationId: true, userId: true },
      });
    }) as { id: string; generationId: string | null; userId: string }[];

    let cleaned = 0;
    let creditsRefunded = 0;

    for (const asset of stuckAssets) {
      await step.run(`mark-failed-${asset.id}`, async () => {
        await db.asset.update({
          where: { id: asset.id },
          data: { generationStatus: "FAILED" } as any,
        });
      });

      const genId = asset.generationId;
      if (genId) {
        await step.run(`cancel-gen-${genId}`, async () => {
          const gen = await db.generation.findUnique({
            where: { id: genId },
            select: { id: true, status: true, userId: true },
          });
          if (gen && gen.status !== "COMPLETED" && gen.status !== "FAILED" && gen.status !== "CANCELLED") {
            await db.generation.update({
              where: { id: genId },
              data: {
                status: "FAILED",
                errorMessage: "系统自动取消（生成超时）",
                completedAt: new Date(),
              },
            });
            await refundCredits(gen.userId, genId).catch(() => {});
            creditsRefunded++;
          }
        });
      }

      cleaned++;
    }

    return {
      cleaned,
      creditsRefunded,
      checkedAt: new Date().toISOString(),
    };
  },
);
