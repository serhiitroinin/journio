// Provider registry. To add a backend: implement the Provider interface in
// src/providers/<name>.ts and append it here. Nothing else needs to change —
// the planner, CLI, and formatters discover providers through this list.

import type { Provider, ProviderContext } from "./types";
import { fetchJson } from "./lib/http";
import { transportRest } from "./providers/transport-rest";
import { swissOpendata } from "./providers/swiss-opendata";
import { amadeus } from "./providers/amadeus";
import { googleRoutes } from "./providers/google-routes";

export const ALL_PROVIDERS: Provider[] = [transportRest, swissOpendata, amadeus, googleRoutes];

export function defaultContext(): ProviderContext {
  return { fetchJson, env: process.env as Record<string, string | undefined> };
}

export function availableProviders(ctx: ProviderContext): Provider[] {
  return ALL_PROVIDERS.filter((p) => p.available(ctx));
}
