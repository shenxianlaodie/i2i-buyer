import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { prefetchListRecent } from "@/server/trpc/prefetch";
import { CanvasBoard } from "@/components/canvas/CanvasBoard";

export default async function StudioPage() {
  const queryClient = await prefetchListRecent();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CanvasBoard />
    </HydrationBoundary>
  );
}
