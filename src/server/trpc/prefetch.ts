import "server-only";
import { getQueryClient, createCaller } from "./server";

const LIST_LIMIT = 6;

export async function prefetchListRecent() {
  const queryClient = getQueryClient();
  const caller = await createCaller();

  // 不缓存：素材 originalUrl 是 base64 大图，超过 2MB 缓存限制会报错
  await queryClient.prefetchQuery({
    queryKey: [
      ["assets", "listAll"],
      {
        input: { limit: LIST_LIMIT },
        type: "query",
      },
    ],
    queryFn: () => caller.assets.listAll({ limit: LIST_LIMIT }),
  });

  return queryClient;
}
