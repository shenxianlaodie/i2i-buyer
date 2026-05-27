import {
  POSE_TYPES,
  POSE_LABELS,
  POSE_PROMPTS,
  type PoseType,
} from "@/lib/pose-types";

export const DEFAULT_PRODUCT_TITLE_PROMPT =
  "根据服装参考图，生成简洁有力的电商商品标题，突出款式与卖点，30字以内，不要标点堆砌。";

export const DEFAULT_PRODUCT_DESCRIPTION_PROMPT =
  "根据服装参考图，生成专业电商商品描述，包含面料、版型、穿着场景与卖点，150-300字，分段清晰。";

export type PromptSettings = {
  pose: Record<PoseType, string>;
  productTitle: string;
  productDescription: string;
};

export function getDefaultPromptSettings(): PromptSettings {
  const pose = {} as Record<PoseType, string>;
  for (const p of POSE_TYPES) {
    pose[p] = POSE_PROMPTS[p];
  }
  return {
    pose,
    productTitle: DEFAULT_PRODUCT_TITLE_PROMPT,
    productDescription: DEFAULT_PRODUCT_DESCRIPTION_PROMPT,
  };
}

export const PROMPT_CONFIG_SECTIONS = [
  {
    title: "多姿势图 · 姿势生成（4 项）",
    description: "图生图时按姿势类型使用的提示词",
    items: POSE_TYPES.map((pose) => ({
      id: pose,
      label: POSE_LABELS[pose],
    })),
  },
  {
    title: "多姿势图 · 商品文案（2 项）",
    description: "参考图 + 提示词 → 文本模型生成中文标题/描述",
    items: [
      { id: "productTitle", label: "商品标题生成" },
      { id: "productDescription", label: "商品描述生成" },
    ],
  },
] as const;
