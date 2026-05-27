export type ProviderId =
  | "ephone"
  | "replicate"
  | "falai"
  | "openai"
  | "runway"
  | "pika"
  | "kling";

export type ModelCapability =
  | "text-to-image"
  | "image-to-image"
  | "inpainting"
  | "outpainting"
  | "image-editing"
  | "text-to-video"
  | "image-to-video"
  | "video-to-video"
  | "upscale";

export interface ModelConfig {
  id: string;
  providerId: ProviderId;
  displayName: string;
  type: "image" | "video";
  capabilities: ModelCapability[];
  maxResolution: Resolution;
  supportedAspectRatios: AspectRatio[];
  pricingPerUnit: number;
  estimatedLatency: LatencyEstimate;
}

export interface Resolution {
  width: number;
  height: number;
}

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9";

export interface LatencyEstimate {
  minMs: number;
  maxMs: number;
  typicalMs: number;
}

export interface ImageSource {
  url: string;
  width?: number;
  height?: number;
}

// ── Unified Input Types ─────────────────────────────────

export interface ImageGenerationInput {
  prompt: string;
  negativePrompt?: string;
  modelId: string;
  provider: ProviderId;
  aspectRatio?: AspectRatio;
  numOutputs?: number;
  seed?: number;
  guidanceScale?: number;
  steps?: number;
  outputFormat?: "png" | "jpg" | "webp";
  referenceImage?: ImageSource;
  maskImage?: ImageSource;
  strength?: number;
}

export interface VideoGenerationInput {
  prompt: string;
  negativePrompt?: string;
  modelId: string;
  provider: ProviderId;
  aspectRatio?: AspectRatio;
  duration?: number;
  resolution?: Resolution;
  seed?: number;
  referenceImage?: ImageSource;
  startFrameUrl?: string;
  endFrameUrl?: string;
  sound?: boolean;
}

// ── Unified Output Types ────────────────────────────────

export interface ImageGenerationOutput {
  id: string;
  status: "completed" | "failed";
  images: GeneratedImage[];
  provider: ProviderId;
  modelId: string;
  providerMetadata: Record<string, unknown>;
  timing: { startedAt: Date; completedAt: Date; durationMs: number };
  cost: { providerCostUsd: number; creditCost: number };
}

export interface GeneratedImage {
  url: string;
  width: number;
  height: number;
  contentType: string;
}

export interface VideoGenerationJob {
  jobId: string;
  provider: ProviderId;
  modelId: string;
  status: "queued" | "processing" | "completed" | "failed";
  estimatedCompletion: Date | null;
  providerMetadata: Record<string, unknown>;
}

export interface VideoGenerationOutput {
  id: string;
  status: "completed" | "failed";
  videos: GeneratedVideo[];
  provider: ProviderId;
  modelId: string;
  providerMetadata: Record<string, unknown>;
  timing: { startedAt: Date; completedAt: Date; durationMs: number };
  cost: { providerCostUsd: number; creditCost: number };
}

export interface GeneratedVideo {
  url: string;
  thumbnailUrl?: string;
  width: number;
  height: number;
  duration: number;
  contentType: string;
}

// ── Gateway Interfaces ───────────────────────────────────

export interface ImageGenerationGateway {
  generate(input: ImageGenerationInput): Promise<ImageGenerationOutput>;
}

export interface VideoGenerationGateway {
  submit(input: VideoGenerationInput): Promise<VideoGenerationJob>;
  getStatus(jobId: string): Promise<VideoGenerationJob>;
  getResult(jobId: string): Promise<VideoGenerationOutput>;
  cancelJob(jobId: string): Promise<void>;
}

export interface AsyncImageGateway {
  submit(input: ImageGenerationInput): Promise<{ jobId: string }>;
  getStatus(
    jobId: string,
  ): Promise<{ status: string; estimatedCompletion?: Date }>;
  getResult(jobId: string): Promise<ImageGenerationOutput>;
}

// ── Registry ─────────────────────────────────────────────

export interface GatewayRegistry {
  getImageGateway(
    provider: ProviderId,
  ): ImageGenerationGateway | AsyncImageGateway;
  getVideoGateway(provider: ProviderId): VideoGenerationGateway;
  listModels(type?: "image" | "video"): ModelConfig[];
  getModel(modelId: string): ModelConfig | undefined;
  allProviders(): ProviderId[];
}
