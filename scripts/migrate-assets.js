const { PrismaClient } = require("@prisma/client");

const localDb = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres123@localhost:5432/i2i-buyer" } },
});
const cloudDb = new PrismaClient();

(async () => {
  // 从本地查所有已完成的 Generation（直接作为素材来源）
  const localGens = await localDb.generation.findMany({
    where: { status: "COMPLETED", outputUrls: { isEmpty: false } },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, credits: true, createdAt: true, updatedAt: true, disabled: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("本地完成生成:", localGens.length, "条");

  let importedUsers = 0;
  let importedGens = 0;
  let importedAssets = 0;
  let skipped = 0;
  let errors = 0;

  for (const gen of localGens) {
    const assetId = "asset-" + gen.id;
    try {
      // 检查云 RDS Asset 是否已存在
      const existAsset = await cloudDb.asset.findUnique({ where: { id: assetId } });
      if (existAsset) {
        skipped++;
        process.stdout.write(".");
        continue;
      }

      // 确保 User 存在
      const existUser = await cloudDb.user.findUnique({ where: { id: gen.userId } });
      if (existUser === null && gen.user) {
        await cloudDb.user.create({
          data: {
            id: gen.user.id,
            name: gen.user.name,
            email: gen.user.email,
            role: gen.user.role || "USER",
            credits: gen.user.credits || 100,
            disabled: gen.user.disabled || false,
            createdAt: gen.user.createdAt,
            updatedAt: gen.user.updatedAt,
          },
        });
        importedUsers++;
      }

      // 确保 Generation 存在
      const existGen = await cloudDb.generation.findUnique({ where: { id: gen.id } });
      if (existGen === null) {
        await cloudDb.generation.create({
          data: {
            id: gen.id,
            userId: gen.userId,
            projectId: gen.projectId,
            type: gen.type,
            provider: gen.provider,
            modelId: gen.modelId,
            status: gen.status,
            prompt: gen.prompt,
            negativePrompt: gen.negativePrompt,
            params: gen.params ?? {},
            referenceImage: gen.referenceImage,
            fusionBatchId: gen.fusionBatchId,
            poseBatchId: gen.poseBatchId,
            fusionRowId: gen.fusionRowId,
            poseRowId: gen.poseRowId,
            poseType: gen.poseType,
            inputSnapshot: gen.inputSnapshot ?? undefined,
            outputUrls: gen.outputUrls,
            outputData: gen.outputData ?? undefined,
            errorMessage: gen.errorMessage,
            startedAt: gen.startedAt,
            completedAt: gen.completedAt,
            duration: gen.duration,
            creditCost: gen.creditCost,
            providerCost: gen.providerCost,
            createdAt: gen.createdAt,
            updatedAt: gen.updatedAt,
          },
        });
        importedGens++;
      }

      // 创建 Asset
      const url = gen.outputUrls[0] ?? "";
      const isVideo = gen.type === "VIDEO";
      await cloudDb.asset.create({
        data: {
          id: assetId,
          userId: gen.userId,
          generationId: gen.id,
          type: gen.type,
          filename: "gen-" + gen.id + (isVideo ? ".mp4" : ".png"),
          originalUrl: url,
          mimeType: isVideo ? "video/mp4" : "image/png",
          createdAt: gen.completedAt ?? gen.createdAt,
          updatedAt: gen.updatedAt,
        },
      });
      importedAssets++;
      process.stdout.write("+");
    } catch (err) {
      errors++;
      console.error("\n  ❌", gen.id.substring(0, 12), err.message?.substring(0, 80));
    }
  }

  console.log("\n\n=== 迁移完成 ===");
  console.log("新增 User:", importedUsers);
  console.log("新增 Generation:", importedGens);
  console.log("新增 Asset:", importedAssets);
  console.log("跳过（已存在）:", skipped);
  console.log("失败:", errors);

  const count = await cloudDb.asset.count();
  console.log("\n云 RDS Asset 总数:", count);

  await localDb.$disconnect();
  await cloudDb.$disconnect();
})();

