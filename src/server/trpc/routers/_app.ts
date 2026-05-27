import { router } from "@/server/trpc/init";
import { generationRouter } from "./generation";
import { assetRouter } from "./assets";
import { providerRouter } from "./providers";
import { creditRouter } from "./credits";
import { fusionRouter } from "./fusion";
import { poseRouter } from "./pose";
import { adminRouter } from "./admin";
import { canvasRouter } from "./canvas";

export const appRouter = router({
  generation: generationRouter,
  assets: assetRouter,
  providers: providerRouter,
  credits: creditRouter,
  fusion: fusionRouter,
  pose: poseRouter,
  admin: adminRouter,
  canvas: canvasRouter,
});

export type AppRouter = typeof appRouter;
