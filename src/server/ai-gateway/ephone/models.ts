export type EphoneModelCategory = "image" | "video" | "other";

export interface EphoneModel {
  id: string;
  ownedBy?: string;
  categories: EphoneModelCategory[];
}

const IMAGE_RE =
  /image|flux|dall|gpt-image|midjourney|sdxl|stable-diffusion|inpaint|edit|t2i|i2i|seedream|ideogram/i;
const VIDEO_RE =
  /video|kling|runway|pika|luma|veo|sora|jimeng|(?:^|[/_-])gen-4(?:[/_-]|$)|gen4[_./-]|minimax.*video|text-to-video|image-to-video|i2v|t2v|wan\//i;

export function getEphoneModelCategories(id: string): EphoneModelCategory[] {
  const lower = id.toLowerCase();
  const categories: EphoneModelCategory[] = [];
  if (IMAGE_RE.test(lower)) categories.push("image");
  if (VIDEO_RE.test(lower)) categories.push("video");
  if (categories.length === 0) categories.push("other");
  return categories;
}

let cache: { at: number; models: EphoneModel[] } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function fetchEphoneModels(): Promise<EphoneModel[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return cache.models;
  }

  const apiKey = process.env.EPHONE_API_KEY;
  if (!apiKey) return [];

  const base = (process.env.EPHONE_BASE_URL ?? "https://api.ephone.ai").replace(
    /\/$/,
    "",
  );

  const res = await fetch(`${base}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`获取模型列表失败 (${res.status}): ${text}`);
  }

  const body = (await res.json()) as {
    data?: { id: string; owned_by?: string }[];
  };

  const models: EphoneModel[] = (body.data ?? []).map((m) => ({
    id: m.id,
    ownedBy: m.owned_by,
    categories: getEphoneModelCategories(m.id),
  }));

  cache = { at: Date.now(), models };
  return models;
}

export function filterEphoneModels(
  models: EphoneModel[],
  category?: EphoneModelCategory,
): EphoneModel[] {
  const list = category
    ? models.filter((m) => m.categories.includes(category))
    : models.filter(
        (m) =>
          !(m.categories.length === 1 && m.categories[0] === "other"),
      );
  return list.sort((a, b) => a.id.localeCompare(b.id));
}
