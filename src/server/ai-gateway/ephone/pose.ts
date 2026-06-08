import type { PoseType } from "@/lib/pose-types";
import type { AspectRatio } from "@/server/ai-gateway/types";
import { getPosePrompt } from "@/lib/system-settings";
import { EphoneClient } from "./client";
import { resolveUrl } from "./resolve-url";
import { ASPECT_RATIO_SIZE_MAP } from "./image-sizes";
import { uploadImageToOSS } from "@/lib/oss-upload";

async function urlToFile(url: string, name: string): Promise<File> {
  const tempMatch = url.match(/\/api\/temp-upload\/([^/]+)$/);
  if (tempMatch) {
    const { getTempUploadData } = await import("@/lib/temp-upload-store");
    const entry = getTempUploadData(tempMatch[1]);
    if (entry) {
      return new File([new Uint8Array(entry.buffer)], name, { type: entry.mime || "image/png" });
    }
    throw new Error("参考图已过期（服务重启后临时文件丢失），请重新上传");
  }

  url = resolveUrl(url);
  if (url.startsWith("data:")) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`无法加载参考图（状态 ${res.status}），请重新上传`);
    const blob = await res.blob();
    return new File([blob], name, { type: blob.type || "image/png" });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`无法加载参考图（状态 ${res.status}），请重新上传`);
  const blob = await res.blob();
  const ext = blob.type.includes("jpeg") ? "jpg" : "png";
  return new File([blob], name, { type: blob.type || "image/png" });
}

export async function runPoseImage(input: {
  sourceImageUrl: string;
  poseType: PoseType;
  extraPrompt?: string;
  modelId?: string;
  aspectRatio?: AspectRatio;
}): Promise<{ url: string; timing: { llmDurationMs: number; ossDurationMs: number } }> {
  const apiKey = process.env.EPHONE_API_KEY;
  if (!apiKey) throw new Error("请配置 EPHONE_API_KEY");

  const ephone = new EphoneClient(apiKey);
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey,
    baseURL: ephone.openaiBaseUrl,
  });

  if (!input.modelId) throw new Error("请选择图片模型");
  const model = input.modelId;
  const imageFile = await urlToFile(input.sourceImageUrl, "source.png");
  const posePrompt = await getPosePrompt(input.poseType);
  const prompt = input.extraPrompt?.trim()
    ? `${posePrompt} ${input.extraPrompt}`
    : posePrompt;
  const size = ASPECT_RATIO_SIZE_MAP[input.aspectRatio ?? "1:1"] ?? "1024x1024";

  const llmStart = Date.now();
  const response = await openai.images.edit({
    model,
    image: imageFile,
    prompt,
    size,
    n: 1,
    response_format: "url",
  });

  const item = response.data?.[0];
  if (!item?.url && !item?.b64_json) {
    throw new Error("多姿势生成失败：无返回数据");
  }

  const llmDurationMs = Date.now() - llmStart;
  const rawUrl = item.url
    ? item.url
    : `data:image/png;base64,${item.b64_json}`;

  // 上传到 OSS 获取永久 URL
  const ossStart = Date.now();
  const oss = await uploadImageToOSS(rawUrl).catch((err) => {
    console.error(`[pose] OSS upload failed, falling back to original URL:`, err.message);
    return null;
  });
  const ossDurationMs = Date.now() - ossStart;

  return { url: oss?.url ?? rawUrl, timing: { llmDurationMs, ossDurationMs } };
}
