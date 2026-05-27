import { db } from "@/lib/db";
import { POSE_TYPES, type PoseType } from "@/lib/pose-types";
import { getDefaultPromptSettings } from "@/lib/prompt-defaults";

export { getDefaultPromptSettings } from "@/lib/prompt-defaults";

export const SETTING_KEYS = {
  pose: (pose: PoseType) => `pose_prompt_${pose}`,
  productTitle: "product_title_prompt",
  productDescription: "product_description_prompt",
} as const;

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
