import { db } from "@/lib/db";

const CREDIT_COSTS: Record<string, number> = {
  "gpt-image-1": 10,
  "kling-v1-6/image-to-video": 20,
  "kling-v3/text-to-video": 20,
  "kling_omni_video": 20,
  "sora-2": 20,
  "black-forest-labs/flux-dev": 5,
  "black-forest-labs/flux-schnell": 2,
  "black-forest-labs/flux-pro": 15,
  "stability-ai/sdxl": 3,
  "dall-e-3": 20,
  "runway/gen-4": 50,
  "pika/2.0": 30,
  "kling/v2.6": 20,
};

export function getCreditCost(modelId: string): number {
  return CREDIT_COSTS[modelId] ?? 10;
}

export async function reserveCredits(
  userId: string,
  generationId: string,
  modelId: string,
): Promise<void> {
  const cost = getCreditCost(modelId);
  const user = await db.user.update({
    where: { id: userId },
    data: { credits: { decrement: cost } },
  });
  await db.creditTransaction.create({
    data: {
      userId,
      amount: -cost,
      balance: user.credits,
      type: "CONSUME",
      generationId,
      description: `Reserved for generation`,
    },
  });
}

export async function grantCredits(
  userId: string,
  amount: number,
  description?: string,
): Promise<number> {
  if (amount <= 0) throw new Error("grant amount must be positive");
  const user = await db.user.update({
    where: { id: userId },
    data: { credits: { increment: amount } },
  });
  await db.creditTransaction.create({
    data: {
      userId,
      amount,
      balance: user.credits,
      type: "GRANT",
      description: description ?? "Admin grant",
    },
  });
  return user.credits;
}

export async function setUserCredits(
  userId: string,
  credits: number,
  description?: string,
): Promise<number> {
  if (credits < 0) throw new Error("credits cannot be negative");
  const prev = await db.user.findUnique({ where: { id: userId } });
  if (!prev) throw new Error("User not found");
  const delta = credits - prev.credits;
  const user = await db.user.update({
    where: { id: userId },
    data: { credits },
  });
  if (delta !== 0) {
    await db.creditTransaction.create({
      data: {
        userId,
        amount: delta,
        balance: user.credits,
        type: "GRANT",
        description: description ?? "Admin set credits",
      },
    });
  }
  return user.credits;
}

export async function refundCredits(
  userId: string,
  generationId: string,
): Promise<void> {
  const cost = await db.creditTransaction.findFirst({
    where: { generationId, type: "CONSUME" },
    orderBy: { createdAt: "desc" },
  });
  if (!cost) return;
  const amount = Math.abs(cost.amount);
  const user = await db.user.update({
    where: { id: userId },
    data: { credits: { increment: amount } },
  });
  await db.creditTransaction.create({
    data: {
      userId,
      amount,
      balance: user.credits,
      type: "REFUND",
      generationId,
      description: "Refund for failed generation",
    },
  });
}
