import { EphoneClient } from "./client";
import { getPromptSettings } from "@/lib/system-settings";

function resolveUrl(url: string): string {
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}

function textModel() {
  return process.env.EPHONE_TEXT_MODEL ?? "gpt-4o-mini";
}

async function visionText(imageUrl: string, instruction: string): Promise<string> {
  const apiKey = process.env.EPHONE_API_KEY;
  if (!apiKey) throw new Error("请配置 EPHONE_API_KEY");

  const ephone = new EphoneClient(apiKey);
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey,
    baseURL: ephone.openaiBaseUrl,
  });

  const response = await openai.chat.completions.create({
    model: textModel(),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${instruction}\n\n只输出正文，使用简体中文，不要引号、不要 markdown、不要解释。`,
          },
          {
            type: "image_url",
            image_url: { url: resolveUrl(imageUrl) },
          },
        ],
      },
    ],
    max_tokens: 1024,
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("模型未返回内容");
  return text.replace(/^["「『]|["」』]$/g, "").trim();
}

export async function generateProductTitle(sourceImageUrl: string) {
  const { productTitle } = await getPromptSettings();
  return visionText(sourceImageUrl, productTitle);
}

export async function generateProductDescription(sourceImageUrl: string) {
  const { productDescription } = await getPromptSettings();
  return visionText(sourceImageUrl, productDescription);
}

export async function translateZhToEn(text: string): Promise<string> {
  if (!text.trim()) throw new Error("内容为空");
  const apiKey = process.env.EPHONE_API_KEY;
  if (!apiKey) throw new Error("请配置 EPHONE_API_KEY");

  const ephone = new EphoneClient(apiKey);
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({
    apiKey,
    baseURL: ephone.openaiBaseUrl,
  });

  const response = await openai.chat.completions.create({
    model: textModel(),
    messages: [
      {
        role: "system",
        content:
          "将中文电商文案翻译成自然、地道的英文。只输出英文译文，不要解释、不要标注。",
      },
      { role: "user", content: text },
    ],
    max_tokens: 2048,
  });

  const out = response.choices[0]?.message?.content?.trim();
  if (!out) throw new Error("翻译失败");
  return out;
}
