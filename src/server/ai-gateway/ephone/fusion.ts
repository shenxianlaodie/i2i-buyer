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
  if (url.startsWith("data:")) {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], name, { type: blob.type || "image/png" });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`无法加载图片: ${res.status}`);
  const blob = await res.blob();
  const ext = blob.type.includes("jpeg") ? "jpg" : "png";
  return new File([blob], name, { type: blob.type || "image/png" });
}

export async function runFusionImage(input: {
  baseImageUrl: string;
  printImageUrl: string;
  prompt: string;
  modelId?: string;
}): Promise<{ url: string; revisedPrompt?: string }> {
  const apiKey = process.env.EPHONE_API_KEY;
  if (!apiKey) {
    throw new Error("请配置 EPHONE_API_KEY");
  }

  const ephone = new EphoneClient(apiKey);
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey,
    baseURL: ephone.openaiBaseUrl,
  });

  if (!input.modelId) throw new Error("请选择图片模型");
  const model = input.modelId;
  const baseFile = await urlToFile(input.baseImageUrl, "base.png");
  const printFile = await urlToFile(input.printImageUrl, "print.png");

  const fusionPrompt =
    input.prompt.trim() ||
    "将第二张图的印花图案自然融合到第一张图的底版服装上，保持底版版型、姿势与光照，印花清晰贴合面料纹理。";

  const response = await openai.images.edit({
    model,
    image: [baseFile, printFile],
    prompt: fusionPrompt,
    size: "1024x1024",
    n: 1,
  });

  const item = response.data?.[0];
  if (item?.url) {
    return { url: item.url, revisedPrompt: item.revised_prompt ?? undefined };
  }
  if (item?.b64_json) {
    return {
      url: `data:image/png;base64,${item.b64_json}`,
      revisedPrompt: item.revised_prompt ?? undefined,
    };
  }
  throw new Error("融合图生成失败：无返回数据");
}
