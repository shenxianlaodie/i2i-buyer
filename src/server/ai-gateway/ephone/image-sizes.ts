import type { AspectRatio } from "@/server/ai-gateway/types";

export const ASPECT_RATIO_SIZE_MAP: Record<AspectRatio, `${number}x${number}`> = {
  "1:1": "1024x1024",
  "16:9": "1792x1024",
  "9:16": "1024x1792",
  "4:3": "1024x768",
  "3:4": "768x1024",
  "21:9": "1792x768",
};

export const ASPECT_RATIOS: AspectRatio[] = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"];

export const ASPECT_RATIO_LABELS: Record<AspectRatio, string> = {
  "1:1": "1:1 正方形",
  "16:9": "16:9 横屏",
  "9:16": "9:16 竖屏",
  "4:3": "4:3 横向",
  "3:4": "3:4 竖向",
  "21:9": "21:9 超宽",
};
