import { NextRequest, NextResponse } from "next/server";

/**
 * 图片下载代理
 *
 * OSS 默认域名响应 Content-Disposition: attachment 但不带 filename，
 * 导致浏览器下载为 .jfif 等错误格式。
 * 此接口从 OSS 取图片后以正确 Content-Disposition 返回，强制 .png 扩展名。
 *
 * GET /api/download?url=<encoded-oss-url>&name=<filename>
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  const name = request.nextUrl.searchParams.get("name") ?? "image.png";

  if (!url) {
    return NextResponse.json({ error: "缺少 url 参数" }, { status: 400 });
  }

  // 安全检查：只允许 OSS 域名（内网 + 公网）
  if (
    !url.includes("oss-cn-hangzhou-internal.aliyuncs.com") &&
    !url.includes("oss-cn-hangzhou.aliyuncs.com")
  ) {
    return NextResponse.json({ error: "不允许的 URL" }, { status: 403 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `获取图片失败: ${res.status}` }, { status: 502 });
    }

    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") ?? "image/png",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "下载失败" }, { status: 502 });
  }
}
