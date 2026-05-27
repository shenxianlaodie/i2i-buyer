import { inngest } from "@/server/inngest/client";
import { db } from "@/lib/db";
import { runImageGeneration } from "@/server/ai-gateway/run-generation";

export const handleImageGeneration = inngest.createFunction(
  {
    id: "image-generation",
    triggers: [{ event: "generation/image.requested" }],
  },
  async ({ event, step }: { event: { data: { generationId: string } }; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => {
    const { generationId } = event.data;

    await step.run("mark-queued", async () => {
      await db.generation.update({
        where: { id: generationId },
        data: { status: "QUEUED" },
      });
    });

    const result = await step.run("process-generation", async () => {
      return runImageGeneration(generationId);
    });

    return result;
  },
);
