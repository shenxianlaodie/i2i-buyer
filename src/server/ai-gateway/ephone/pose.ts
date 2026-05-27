import type { PoseType } from "@/lib/pose-types";
import { getPosePrompt } from "@/lib/system-settings";
import { EphoneClient } from "./client";

function resolveUrl(url: string): string {
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}

async function urlToFile(url: string, name: string): Promise<File> {
  url = resolveUrl(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`无法加载图片: ${res.status}`);
  const blob = await res.blob();
  const ext = blob.type.includes("jpeg") ? "jpg" : "png";
  return new File([blob], name, { type: blob.type || "image/png" });
}

export async function runPoseImage(input: {
  sourceImageUrl: string;
  poseType: PoseType;
  extraPrompt?: string;
  modelId?: string;
}): Promise<{ url: string }> {
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

  const response = await openai.images.edit({
    model,
    image: imageFile,
    prompt,
    size: "1024x1024",
    n: 1,
  });

  const item = response.data?.[0];
  if (item?.url) return { url: item.url };
  if (item?.b64_json) {
    return { url: `data:image/png;base64,${item.b64_json}` };
  }
  throw new Error("多姿势生成失败：无返回数据");
}
