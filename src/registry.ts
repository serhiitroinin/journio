// Provider registry. To add a backend: implement the Provider interface in
// src/providers/<name>.ts and append it here. Nothing else needs to change —
// the planner, CLI, and formatters discover providers through this list.

import type { ModePref, Provider, ProviderContext } from "./types";
import { fetchJson } from "./lib/http";
import { chooseMode, DEFAULT_HOSTED_BASE } from "./lib/gateway";
import { transportRest } from "./providers/transport-rest";
import { swissOpendata } from "./providers/swiss-opendata";
import { amadeus } from "./providers/amadeus";
import { googleRoutes } from "./providers/google-routes";

export const ALL_PROVIDERS: Provider[] = [transportRest, swissOpendata, amadeus, googleRoutes];

/**
 * Build the default context from the environment. Overrides (e.g. from CLI
 * flags) win over env vars.
 *
 *   JOURNIO_KEY       single hosted cloud key (enables hosted access)
 *   JOURNIO_API_URL   gateway base URL (default https://api.journio.dev/v1)
 *   JOURNIO_MODE      auto (default) | direct | hosted
 */
export function defaultContext(overrides: Partial<ProviderContext> = {}): ProviderContext {
  const env = process.env as Record<string, string | undefined>;
  return {
    fetchJson,
    env,
    hostedKey: env.JOURNIO_KEY,
    hostedBaseUrl: env.JOURNIO_API_URL || DEFAULT_HOSTED_BASE,
    modePref: (env.JOURNIO_MODE as ModePref) || "auto",
    ...overrides,
  };
}

export function availableProviders(ctx: ProviderContext): Provider[] {
  return ALL_PROVIDERS.filter((p) => chooseMode(p, ctx) !== null);
}
