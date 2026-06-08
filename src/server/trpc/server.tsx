import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import superjson from "superjson";
import { createContext } from "./init";
import { appRouter } from "./routers/_app";

export const getQueryClient = cache(() => {
  const { QueryClient } = require("@tanstack/react-query");
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60 * 1000, gcTime: 10 * 60 * 1000 },
      dehydrate: {
        serializeData: superjson.serialize,
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
});

export const createCaller = cache(async () => {
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createContext({ headers: heads });
  return appRouter.createCaller(ctx);
});
