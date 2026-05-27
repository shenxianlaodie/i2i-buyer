import type { ModelConfig, ProviderId, GatewayRegistry } from "./types";

export const MODEL_CONFIGS: ModelConfig[] = [
  {
    id: "gpt-image-1",
    providerId: "ephone",
    displayName: "GPT Image 1 (ePhone)",
    type: "image",
    capabilities: ["text-to-image", "image-to-image", "image-editing"],
    maxResolution: { width: 1792, height: 1024 },
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    pricingPerUnit: 0.04,
    estimatedLatency: { minMs: 5000, maxMs: 60000, typicalMs: 15000 },
  },
  {
    id: "kling-v1-6/image-to-video",
    providerId: "ephone",
    displayName: "Kling 1.6 图生视频 (ePhone)",
    type: "video",
    capabilities: ["image-to-video"],
    maxResolution: { width: 1920, height: 1080 },
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    pricingPerUnit: 0.25,
    estimatedLatency: { minMs: 45000, maxMs: 300000, typicalMs: 120000 },
  },
  {
    id: "kling-v3/text-to-video",
    providerId: "ephone",
    displayName: "Kling 3 文生视频 (ePhone)",
    type: "video",
    capabilities: ["text-to-video", "image-to-video"],
    maxResolution: { width: 1920, height: 1080 },
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    pricingPerUnit: 0.3,
    estimatedLatency: { minMs: 60000, maxMs: 360000, typicalMs: 150000 },
  },
  // ── Replicate (Flux, SDXL) ──────────────────────
  {
    id: "black-forest-labs/flux-dev",
    providerId: "replicate",
    displayName: "FLUX.1 [dev]",
    type: "image",
    capabilities: ["text-to-image", "image-to-image", "inpainting"],
    maxResolution: { width: 2048, height: 2048 },
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    pricingPerUnit: 0.003,
    estimatedLatency: { minMs: 3000, maxMs: 15000, typicalMs: 6000 },
  },
  {
    id: "black-forest-labs/flux-schnell",
    providerId: "replicate",
    displayName: "FLUX.1 [schnell]",
    type: "image",
    capabilities: ["text-to-image"],
    maxResolution: { width: 1920, height: 1920 },
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    pricingPerUnit: 0.001,
    estimatedLatency: { minMs: 1000, maxMs: 5000, typicalMs: 2000 },
  },
  {
    id: "stability-ai/sdxl",
    providerId: "replicate",
    displayName: "SDXL",
    type: "image",
    capabilities: ["text-to-image", "image-to-image", "inpainting"],
    maxResolution: { width: 1024, height: 1024 },
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    pricingPerUnit: 0.002,
    estimatedLatency: { minMs: 2000, maxMs: 10000, typicalMs: 4000 },
  },
  // ── Fal.ai (Flux) ────────────────────────────────
  {
    id: "fal-ai/flux/dev",
    providerId: "falai",
    displayName: "FLUX.1 [dev] (fal.ai)",
    type: "image",
    capabilities: ["text-to-image", "image-to-image", "inpainting"],
    maxResolution: { width: 2048, height: 2048 },
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    pricingPerUnit: 0.002,
    estimatedLatency: { minMs: 2000, maxMs: 10000, typicalMs: 4000 },
  },
  // ── OpenAI (DALL-E) ──────────────────────────────
  {
    id: "dall-e-3",
    providerId: "openai",
    displayName: "DALL-E 3",
    type: "image",
    capabilities: ["text-to-image", "image-editing"],
    maxResolution: { width: 1792, height: 1024 },
    supportedAspectRatios: ["1:1", "16:9", "9:16"],
    pricingPerUnit: 0.04,
    estimatedLatency: { minMs: 5000, maxMs: 30000, typicalMs: 12000 },
  },
  // ── Runway ───────────────────────────────────────
  {
    id: "runway/gen-4",
    providerId: "runway",
    displayName: "Runway Gen-4",
    type: "video",
    capabilities: ["text-to-video", "image-to-video"],
    maxResolution: { width: 1280, height: 720 },
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    pricingPerUnit: 0.5,
    estimatedLatency: { minMs: 60000, maxMs: 300000, typicalMs: 120000 },
  },
  // ── Pika ─────────────────────────────────────────
  {
    id: "pika/2.0",
    providerId: "pika",
    displayName: "Pika 2.0",
    type: "video",
    capabilities: ["text-to-video", "image-to-video"],
    maxResolution: { width: 1920, height: 1080 },
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    pricingPerUnit: 0.3,
    estimatedLatency: { minMs: 30000, maxMs: 180000, typicalMs: 90000 },
  },
  // ── Kling ────────────────────────────────────────
  {
    id: "kling/v2.6",
    providerId: "kling",
    displayName: "Kling 2.6",
    type: "video",
    capabilities: ["text-to-video", "image-to-video"],
    maxResolution: { width: 1920, height: 1080 },
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    pricingPerUnit: 0.25,
    estimatedLatency: { minMs: 45000, maxMs: 240000, typicalMs: 100000 },
  },
];

export function getModelConfig(modelId: string): ModelConfig | undefined {
  return MODEL_CONFIGS.find((m) => m.id === modelId);
}

export function listModels(type?: "image" | "video"): ModelConfig[] {
  if (!type) return MODEL_CONFIGS;
  return MODEL_CONFIGS.filter((m) => m.type === type);
}

export function getAvailableProviders(): ProviderId[] {
  const providers = new Set(MODEL_CONFIGS.map((m) => m.providerId));
  return Array.from(providers);
}
