/**
 * OSS 上传工具函数
 *
 * 将 AI 生成的图片（HTTP URL 或 base64）转存到阿里云 OSS，
 * 并利用 OSS 图片处理参数动态生成缩略图/预览图。
 * 同时提取图片宽高 + 生成 BlurHash 占位图。
 *
 * OSS 上传服务地址：http://localhost:3001
 */

import { encode } from "blurhash";
import sharp from "sharp";

const OSS_UPLOAD_BASE = process.env.OSS_UPLOAD_BASE ?? "http://localhost:3001";

export interface OssUploadResult {
  url: string;
  key: string;
  filename?: string;
  width?: number;
  height?: number;
  blurHash?: string;
}

/**
 * 通过 HTTP URL 上传到 OSS（OSS 服务自行下载）
 */
async function uploadByUrl(imageUrl: string): Promise<OssUploadResult> {
  const res = await fetch(`${OSS_UPLOAD_BASE}/api/upload-by-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: imageUrl }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OSS upload-by-url failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  // 兼容两种返回格式：
  // 1. { results: [{ url, key, filename }], errors: [] }
  // 2. { url, key, filename }
  if (data.results && Array.isArray(data.results) && data.results.length > 0) {
    const first = data.results[0];
    return { url: first.url, key: first.key, filename: first.filename };
  }
  return data as OssUploadResult;
}

/**
 * 通过 base64 上传到 OSS（解码后 multipart 上传）
 */
async function uploadByBase64(base64: string): Promise<OssUploadResult> {
  // 解析 base64 data URL: "data:image/png;base64,iVBORw0KGgo..."
  const match = base64.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid base64 data URL");
  }

  const mimeType = match[1]; // e.g. "image/png"
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, "base64");

  // 推断文件扩展名
  const ext = mimeType.includes("jpeg") || mimeType.includes("jpg")
    ? "jpg"
    : mimeType.includes("webp")
      ? "webp"
      : "png";

  const blob = new Blob([buffer], { type: mimeType });
  const formData = new FormData();
  formData.append("file", blob, `image.${ext}`);

  const res = await fetch(`${OSS_UPLOAD_BASE}/api/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OSS upload failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<OssUploadResult>;
}

/**
 * 上传图片到 OSS，自动识别输入类型（HTTP URL 或 base64）
 *
 * 上传完成后自动提取图片宽高和 BlurHash。
 *
 * @param input - HTTP URL 或 base64 data URL
 * @returns OSS 上传结果 { url, key, width, height, blurHash }
 */
export async function uploadImageToOSS(input: string): Promise<OssUploadResult> {
  if (!input) {
    throw new Error("uploadImageToOSS: empty input");
  }

  let result: OssUploadResult;

  if (input.startsWith("data:")) {
    result = await uploadByBase64(input);
  } else if (input.startsWith("http://") || input.startsWith("https://")) {
    result = await uploadByUrl(input);
  } else {
    throw new Error(`uploadImageToOSS: unsupported input format: ${input.slice(0, 80)}`);
  }

  // 上传成功后提取宽高和 BlurHash
  try {
    const meta = await extractImageMeta(result.url);
    result.width = meta.width;
    result.height = meta.height;
    result.blurHash = meta.blurHash;
  } catch (err) {
    console.warn(`[oss-upload] extractImageMeta failed for ${result.url}:`, (err as Error).message);
  }

  return result;
}

/**
 * 从图片 URL 提取宽高 + BlurHash
 *
 * 宽高：从原图获取（sharp 只读文件头，不下载完整像素）
 * BlurHash：从缩略图获取（400px WebP，体积小）
 */
export async function extractImageMeta(
  imageUrl: string,
): Promise<{ width: number; height: number; blurHash: string }> {
  // 宽高：从原图读取（只取元数据，不解码全图）
  const metaRes = await fetch(imageUrl);
  if (!metaRes.ok) {
    throw new Error(`Failed to fetch original for metadata: ${metaRes.status}`);
  }
  const origBuffer = Buffer.from(await metaRes.arrayBuffer());
  const metadata = await sharp(origBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  // BlurHash：从缩略图获取（体积小，速度快）
  const thumbUrl = ossUrlThumb(imageUrl);
  const thumbRes = await fetch(thumbUrl);
  if (!thumbRes.ok) {
    throw new Error(`Failed to fetch thumbnail for blurhash: ${thumbRes.status}`);
  }
  const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
  const { data, info } = await sharp(thumbBuffer)
    .ensureAlpha()
    .raw()
    .resize(32, 32, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });

  const blurHash = encode(
    new Uint8ClampedArray(data),
    info.width,
    info.height,
    4, 3,
  );

  return { width, height, blurHash };
}

/**
 * OSS 图片处理参数
 *
 * 利用阿里云 OSS 自带图片处理功能，通过 URL 参数实时生成处理后的图片，
 * 无需服务器端额外处理。结果会被 CDN 缓存。
 */

const THUMB_PARAMS = "image/resize,w_400/format,webp/quality,q_75";
const PREVIEW_PARAMS = "image/resize,w_1200/format,webp/quality,q_85";

/**
 * 拼接 OSS 缩略图 URL（400px WebP）
 */
export function ossUrlThumb(ossUrl: string): string {
  if (!ossUrl) return ossUrl;
  const sep = ossUrl.includes("?") ? "&" : "?";
  return `${ossUrl}${sep}x-oss-process=${THUMB_PARAMS}`;
}

/**
 * 拼接 OSS 预览图 URL（1200px WebP）
 */
export function ossUrlPreview(ossUrl: string): string {
  if (!ossUrl) return ossUrl;
  const sep = ossUrl.includes("?") ? "&" : "?";
  return `${ossUrl}${sep}x-oss-process=${PREVIEW_PARAMS}`;
}
