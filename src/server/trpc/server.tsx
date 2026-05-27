import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { createContext } from "./init";
import { appRouter } from "./routers/_app";

export const getQueryClient = cache(() => {
  // Returns a new QueryClient per request for RSC
  const { QueryClient } = require("@tanstack/react-query");
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30 * 1000 },
    },
  });
});

export const createCaller = cache(async () => {
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createContext({ headers: heads });
  return appRouter.createCaller(ctx);
});
