import { EphoneClient } from "./client";
import { resolveUrl } from "./resolve-url";
import { getPromptSettings, getModelSettings } from "@/lib/system-settings";

async function textModel(): Promise<string> {
  const { textModelId } = await getModelSettings();
  return textModelId;
}

async function resolveImageUrl(url: string): Promise<string> {
  const tempMatch = url.match(/\/api\/temp-upload\/([^/]+)$/);
  if (tempMatch) {
    const { getTempUploadData } = await import("@/lib/temp-upload-store");
    const entry = getTempUploadData(tempMatch[1]);
    if (entry) {
      const b64 = entry.buffer.toString("base64");
      return `data:${entry.mime || "image/png"};base64,${b64}`;
    }
    throw new Error("参考图已过期，请重新上传");
  }
  return resolveUrl(url);
}

async function createOpenAI() {
  const apiKey = process.env.EPHONE_API_KEY;
  if (!apiKey) throw new Error("请配置 EPHONE_API_KEY");
  const ephone = new EphoneClient(apiKey);
  const OpenAI = (await import("openai")).default;
  return new OpenAI({ apiKey, baseURL: ephone.openaiBaseUrl });
}

async function visionText(imageUrl: string, instruction: string): Promise<string> {
  const openai = await createOpenAI();
  const resolved = await resolveImageUrl(imageUrl);

  const response = await openai.chat.completions.create({
    model: await textModel(),
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
            image_url: { url: resolved },
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
  const openai = await createOpenAI();

  const response = await openai.chat.completions.create({
    model: await textModel(),
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
