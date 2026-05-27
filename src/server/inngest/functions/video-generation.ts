import { inngest } from "@/server/inngest/client";
import { db } from "@/lib/db";
import { runVideoGeneration } from "@/server/ai-gateway/run-generation";

export const handleVideoGeneration = inngest.createFunction(
  {
    id: "video-generation",
    retries: 3,
    triggers: [{ event: "generation/video.requested" }],
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
      return runVideoGeneration(generationId);
    });

    return result;
  },
);
