import { auth } from "@/lib/auth";
import { putTempUpload } from "@/lib/temp-upload-store";
import { uploadImageToOSS } from "@/lib/oss-upload";
import { NextResponse } from "next/server";

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const safeExt = ["png", "jpg", "jpeg", "webp"].includes(ext) ? ext : "png";
  const mime = file.type || MIME[safeExt] || "image/png";

  // 同时上传到 OSS 获取永久 URL（服务重启不丢失）
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
  let ossUrl: string | null = null;
  try {
    const result = await uploadImageToOSS(dataUrl);
    ossUrl = result.url;
  } catch (err) {
    console.error("[upload] OSS upload failed, falling back to temp store:", (err as Error).message);
  }

  // 保留 temp store 作为兜底（OSS 失败时仍可用）
  const id = putTempUpload(session.user.id, buffer, mime);
  const tempUrl = `/api/temp-upload/${id}`;

  return NextResponse.json({ url: ossUrl ?? tempUrl });
}
