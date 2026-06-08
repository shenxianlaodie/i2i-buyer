/**
 * 一次性脚本：将 5 张已生成图片转存到 OSS，更新 Generation.outputUrls + 创建 Asset 记录
 *
 * 运行方式：npx tsx scripts/migrate-5-assets.ts
 */

import { db } from "../src/lib/db";
import { uploadImageToOSS, ossUrlThumb, ossUrlPreview } from "../src/lib/oss-upload";

async function main() {
  console.log("🔍 查找需要转存的生成记录...\n");

  // 找 5 条没有 Asset 关联的已完成的图片生成记录
  const gens = await db.generation.findMany({
    where: {
      status: "COMPLETED",
      type: "IMAGE",
      assets: { none: {} }, // 没有关联 Asset 的
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      _count: { select: { assets: true } },
    },
  });

  if (gens.length === 0) {
    // 如果都有 Asset 了，退而求其次找 outputUrls 是 HTTP 的
    const fallback = await db.generation.findMany({
      where: {
        status: "COMPLETED",
        type: "IMAGE",
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    console.log(`所有记录都已有 Asset，但仍有 ${fallback.length} 条可检查\n`);

    for (const g of fallback) {
      const url = g.outputUrls?.[0] ?? "";
      const isOss = url.includes("oss-cn-hangzhou-internal");
      console.log(`  ${g.id.slice(-8)} | OSS:${isOss} | ${url.slice(0, 80)}`);
    }
    await db.$disconnect();
    return;
  }

  console.log(`找到 ${gens.length} 条待转存记录：\n`);

  let success = 0;
  let failed = 0;

  for (const g of gens) {
    const rawUrl = g.outputUrls?.[0];
    if (!rawUrl) {
      console.log(`  ⏭️  ${g.id.slice(-8)} | 无 outputUrl，跳过`);
      continue;
    }

    const preview = rawUrl.slice(0, 80);
    console.log(`  📤 ${g.id.slice(-8)} | 上传中... ${preview}`);

    try {
      const oss = await uploadImageToOSS(rawUrl);
      const ossUrl = oss.url;
      console.log(`     ✅ OSS: ${ossUrl.slice(0, 80)}`);

      // 更新 Generation.outputUrls
      await db.generation.update({
        where: { id: g.id },
        data: { outputUrls: [ossUrl] },
      });

      // 创建 Asset 记录
      await db.asset.create({
        data: {
          userId: g.userId,
          projectId: g.projectId,
          generationId: g.id,
          type: "IMAGE",
          filename: `gen-${g.id}.png`,
          originalUrl: ossUrl,
          urlThumb: ossUrlThumb(ossUrl),
          urlPreview: ossUrlPreview(ossUrl),
          blurHash: oss.blurHash ?? undefined,
          width: oss.width ?? null,
          height: oss.height ?? null,
          mimeType: "image/png",
        },
      });

      // 验证缩略图可访问
      const thumbUrl = ossUrlThumb(ossUrl);
      const check = await fetch(thumbUrl, { method: "HEAD" }).catch(() => null);
      console.log(`     🖼️  缩略图: ${check?.ok ? "OK" : "N/A"} | ${thumbUrl.slice(0, 80)}`);
      console.log(`     📐 尺寸: ${oss.width ?? "?"}×${oss.height ?? "?"} | blurHash: ${oss.blurHash?.slice(0, 12) ?? "N/A"}...`);

      success++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`     ❌ 失败: ${msg}`);
      failed++;
    }
  }

  console.log(`\n📊 完成：成功 ${success}，失败 ${failed}`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
