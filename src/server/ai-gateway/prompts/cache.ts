import type { ImageGenerationInput, VideoGenerationInput } from "../types";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createHash } from "crypto";

function hashInput(input: ImageGenerationInput | VideoGenerationInput): string {
  const payload = JSON.stringify({
    prompt: input.prompt,
    modelId: input.modelId,
    params: { ...input, prompt: undefined, modelId: undefined },
  });
  return createHash("sha256").update(payload).digest("hex");
}

export async function lookup(input: ImageGenerationInput | VideoGenerationInput) {
  const promptHash = hashInput(input);
  const cached = await db.promptCache.findUnique({
    where: { promptHash },
  });
  if (!cached) return null;
  await db.promptCache.update({
    where: { id: cached.id },
    data: { hitCount: { increment: 1 } },
  });
  return cached;
}

export async function store(
  input: ImageGenerationInput | VideoGenerationInput,
  resultUrls: string[],
  resultData?: Prisma.InputJsonValue,
) {
  const promptHash = hashInput(input);
  await db.promptCache.upsert({
    where: { promptHash },
    create: {
      promptHash,
      prompt: input.prompt,
      modelId: input.modelId,
      params: { ...input, prompt: undefined, modelId: undefined } as unknown as Prisma.InputJsonValue,
      resultUrls,
      resultData: resultData ?? {},
    },
    update: {
      resultUrls,
      resultData: resultData ?? {},
      updatedAt: new Date(),
    },
  });
}
