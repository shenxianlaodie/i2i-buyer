import type { Prisma } from "@prisma/client";

export type GenerationInputSnapshot = {
  kind: "fusion" | "pose";
  batchId: string;
  rowId: string;
  poseType?: string;
  hasBase?: boolean;
  hasPrint?: boolean;
  hasSource?: boolean;
};

export function buildInputSnapshot(
  snapshot: GenerationInputSnapshot,
): Prisma.InputJsonValue {
  return snapshot as unknown as Prisma.InputJsonValue;
}

export function createGenerationAuditData(input: {
  userId: string;
  modelId: string;
  prompt: string;
  creditCost: number;
  snapshot: GenerationInputSnapshot;
  poseType?: string;
}) {
  return {
    userId: input.userId,
    type: "IMAGE" as const,
    provider: "EPHONE" as const,
    modelId: input.modelId,
    status: "PROCESSING" as const,
    prompt: input.prompt,
    params: {} as Prisma.InputJsonValue,
    referenceImage: null,
    inputSnapshot: buildInputSnapshot(input.snapshot),
    fusionBatchId:
      input.snapshot.kind === "fusion" ? input.snapshot.batchId : null,
    poseBatchId: input.snapshot.kind === "pose" ? input.snapshot.batchId : null,
    fusionRowId:
      input.snapshot.kind === "fusion" ? input.snapshot.rowId : null,
    poseRowId: input.snapshot.kind === "pose" ? input.snapshot.rowId : null,
    poseType: input.poseType ?? null,
    creditCost: input.creditCost,
    startedAt: new Date(),
  };
}
