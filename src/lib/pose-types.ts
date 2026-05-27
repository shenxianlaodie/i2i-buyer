export const POSE_TYPES = [
  "front_full",
  "back_full",
  "right_upper",
  "front_upper",
] as const;

export type PoseType = (typeof POSE_TYPES)[number];

export const POSE_LABELS: Record<PoseType, string> = {
  front_full: "正面全身图",
  back_full: "背面全身图",
  right_upper: "右侧上身图",
  front_upper: "正面上身图",
};

export const POSE_PROMPTS: Record<PoseType, string> = {
  front_full:
    "保持参考图中同款服装、颜色与细节，生成电商用正面全身模特照，人物正面站立，完整展示服装，背景简洁干净，专业摄影光照。",
  back_full:
    "保持参考图中同款服装、颜色与细节，生成电商用背面全身模特照，人物背对镜头站立，完整展示服装背面，背景简洁干净。",
  right_upper:
    "保持参考图中同款服装、颜色与细节，生成右侧半身照（腰部以上），人物右侧身对镜头，突出上衣细节，背景简洁。",
  front_upper:
    "保持参考图中同款服装、颜色与细节，生成正面半身照（腰部以上），人物正面，突出服装上身细节，背景简洁。",
};

export const DEFAULT_POSE_SELECTION: PoseType[] = [...POSE_TYPES];
