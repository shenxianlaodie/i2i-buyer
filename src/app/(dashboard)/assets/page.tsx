import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { prefetchListRecent } from "@/server/trpc/prefetch";
import { AssetsContent } from "./AssetsContent";

export default async function AssetsPage() {
  const queryClient = await prefetchListRecent();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AssetsContent />
    </HydrationBoundary>
  );
}
