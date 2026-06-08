/**
 * 逐张处理 base64 素材 → 保存为文件 → 替换 originalUrl
 * 一次只处理 1 张，处理完立即释放内存
 * 运行: node --max-old-space-size=512 scripts/convert-base64-assets.js
 */
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const db = new PrismaClient();
const OUTPUT_DIR = path.join(__dirname, "..", "public", "uploads", "assets");

async function main() {
  // 确保输出目录存在
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 只取需要处理的记录（base64），一次只取一条
  let total = 0;
  let ok = 0;
  let skip = 0;
  let fail = 0;

  while (true) {
    // 每次只查 1 条
    const asset = await db.asset.findFirst({
      where: { originalUrl: { startsWith: "data:" } },
      select: { id: true, originalUrl: true, type: true },
    });

    if (!asset) break;
    total++;

    try {
      const ext = asset.type === "VIDEO" ? "mp4" : "png";
      const filename = `${asset.id}.${ext}`;
      const filepath = path.join(OUTPUT_DIR, filename);

      // 跳过已存在的文件
      if (fs.existsSync(filepath)) {
        // 更新 URL
        await db.asset.update({
          where: { id: asset.id },
          data: { originalUrl: `/uploads/assets/${filename}` },
        });
        skip++;
        process.stdout.write("s");
        continue;
      }

      // 解析 base64 data URL
      const dataUrl = asset.originalUrl;
      const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
      if (!base64Match) {
        console.error(`\n  ❌ ${asset.id}: 无法解析 data URL`);
        fail++;
        continue;
      }

      // 写入文件（同步写入避免并发内存堆积）
      const buffer = Buffer.from(base64Match[1], "base64");
      fs.writeFileSync(filepath, buffer);

      // 更新数据库
      await db.asset.update({
        where: { id: asset.id },
        data: { originalUrl: `/uploads/assets/${filename}` },
      });

      ok++;
      process.stdout.write(".");

      // 主动释放引用
      buffer.fill(0);
    } catch (err) {
      fail++;
      console.error(`\n  ❌ ${asset.id}: ${err.message?.substring(0, 60)}`);
    }

    // 每 10 张输出进度
    if (total % 10 === 0) {
      console.log(` ${total}/32`);
    }

    // 给 GC 一点喘息空间
    if (global.gc) global.gc();
  }

  console.log(`\n\n=== 完成 ===`);
  console.log(`总计: ${total} | 成功: ${ok} | 跳过: ${skip} | 失败: ${fail}`);

  // 验证
  const remaining = await db.asset.count({
    where: { originalUrl: { startsWith: "data:" } },
  });
  console.log(`剩余 base64: ${remaining}`);
  if (remaining === 0) console.log("✅ 全部转换完毕");

  await db.$disconnect();
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
