import { db } from "@/lib/db";
import { POSE_TYPES, type PoseType } from "@/lib/pose-types";
import { getDefaultPromptSettings } from "@/lib/prompt-defaults";

export { getDefaultPromptSettings } from "@/lib/prompt-defaults";

export const SETTING_KEYS = {
  pose: (pose: PoseType) => `pose_prompt_${pose}`,
  productTitle: "product_title_prompt",
  productDescription: "product_description_prompt",
  defaultImageModel: "default_image_model",
  defaultVideoModel: "default_video_model",
  defaultTextModel: "default_text_model",
} as const;

const FALLBACK_IMAGE_MODEL = "gpt-image-1";
const FALLBACK_VIDEO_MODEL = "kling-v1-6/image-to-video";
const FALLBACK_TEXT_MODEL = "gpt-4o-mini";

let modelSettingsCache: { data: Awaited<ReturnType<typeof fetchModelSettings>>; at: number } | null = null;
const MODEL_SETTINGS_TTL = 60_000;

async function fetchModelSettings() {
  const rows = await db.systemSetting.findMany({
    where: {
      key: {
        in: [
          SETTING_KEYS.defaultImageModel,
          SETTING_KEYS.defaultVideoModel,
          SETTING_KEYS.defaultTextModel,
        ],
      },
    },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    imageModelId: map.get(SETTING_KEYS.defaultImageModel) ?? FALLBACK_IMAGE_MODEL,
    videoModelId: map.get(SETTING_KEYS.defaultVideoModel) ?? FALLBACK_VIDEO_MODEL,
    textModelId: map.get(SETTING_KEYS.defaultTextModel) ?? FALLBACK_TEXT_MODEL,
  };
}

export async function getModelSettings() {
  if (modelSettingsCache && Date.now() - modelSettingsCache.at < MODEL_SETTINGS_TTL) {
    return modelSettingsCache.data;
  }
  const data = await fetchModelSettings();
  modelSettingsCache = { data, at: Date.now() };
  return data;
}

export async function saveModelSettings(input: {
  imageModelId: string;
  videoModelId: string;
  textModelId: string;
}) {
  modelSettingsCache = null;
  await db.$transaction([
    db.systemSetting.upsert({
      where: { key: SETTING_KEYS.defaultImageModel },
      create: { key: SETTING_KEYS.defaultImageModel, value: input.imageModelId },
      update: { value: input.imageModelId },
    }),
    db.systemSetting.upsert({
      where: { key: SETTING_KEYS.defaultVideoModel },
      create: { key: SETTING_KEYS.defaultVideoModel, value: input.videoModelId },
      update: { value: input.videoModelId },
    }),
    db.systemSetting.upsert({
      where: { key: SETTING_KEYS.defaultTextModel },
      create: { key: SETTING_KEYS.defaultTextModel, value: input.textModelId },
      update: { value: input.textModelId },
    }),
  ]);
}

export async function getPromptSettings() {
  const defaults = getDefaultPromptSettings();
  const keys = [
    ...POSE_TYPES.map((p) => SETTING_KEYS.pose(p)),
    SETTING_KEYS.productTitle,
    SETTING_KEYS.productDescription,
  ];
  const rows = await db.systemSetting.findMany({
    where: { key: { in: keys } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const pose = {} as Record<PoseType, string>;
  for (const p of POSE_TYPES) {
    pose[p] = map.get(SETTING_KEYS.pose(p)) ?? defaults.pose[p];
  }
  return {
    pose,
    productTitle:
      map.get(SETTING_KEYS.productTitle) ?? defaults.productTitle,
    productDescription:
      map.get(SETTING_KEYS.productDescription) ??
      defaults.productDescription,
  };
}

export async function getPosePrompt(poseType: PoseType): Promise<string> {
  const settings = await getPromptSettings();
  return settings.pose[poseType];
}

export async function savePromptSettings(input: {
  pose: Record<PoseType, string>;
  productTitle: string;
  productDescription: string;
}) {
  const ops = [
    ...POSE_TYPES.map((p) =>
      db.systemSetting.upsert({
        where: { key: SETTING_KEYS.pose(p) },
        create: { key: SETTING_KEYS.pose(p), value: input.pose[p] },
        update: { value: input.pose[p] },
      }),
    ),
    db.systemSetting.upsert({
      where: { key: SETTING_KEYS.productTitle },
      create: {
        key: SETTING_KEYS.productTitle,
        value: input.productTitle,
      },
      update: { value: input.productTitle },
    }),
    db.systemSetting.upsert({
      where: { key: SETTING_KEYS.productDescription },
      create: {
        key: SETTING_KEYS.productDescription,
        value: input.productDescription,
      },
      update: { value: input.productDescription },
    }),
  ];
  await db.$transaction(ops);
}
