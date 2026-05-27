export type GenerationType = "IMAGE" | "VIDEO";

export type GenerationStatus =
  | "PENDING"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface GenerationParams {
  aspectRatio?: string;
  numOutputs?: number;
  seed?: number;
  guidanceScale?: number;
  steps?: number;
  duration?: number;
  strength?: number;
}

export interface GenerationRecord {
  id: string;
  userId: string;
  type: GenerationType;
  provider: string;
  modelId: string;
  status: GenerationStatus;
  prompt: string;
  negativePrompt?: string;
  params: GenerationParams;
  referenceImage?: string;
  outputUrls: string[];
  outputData?: Record<string, unknown>;
  errorMessage?: string;
  creditCost: number;
  createdAt: string;
  completedAt?: string;
}
