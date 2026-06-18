// Access resolution — the heart of journio's dual auth model.
//
// For each provider we decide whether to talk to the upstream API *directly*
// (the user's own keys, BYOK) or route through the *hosted* journio gateway
// (one cloud key that fans out to every provider under the hood, metered and
// billed centrally).
//
// `auto` precedence (the default and the product's whole point):
//   1. If the provider can run directly (keyless upstream, or the user has its
//      keys) -> direct. We never bill the cloud for what the user can do free.
//   2. Otherwise, if a hosted key is present -> hosted (rent it from journio).
//   3. Otherwise -> unavailable.
// `direct` / `hosted` force one path for the whole run.

import type { AccessMode, ModePref, Provider, ProviderContext } from "../types";

export const DEFAULT_HOSTED_BASE = "https://api.journio.dev/v1";

export interface Access {
  mode: AccessMode;
  /** Base URL to prefix request paths with. */
  baseUrl: string;
  /** Auth headers to attach to every request in this mode. */
  headers: Record<string, string>;
}

function hostedBase(ctx: ProviderContext): string {
  return ctx.hostedBaseUrl ?? DEFAULT_HOSTED_BASE;
}

/** Decide which access mode a provider will use, or null if unavailable. */
export function chooseMode(p: Provider, ctx: ProviderContext): AccessMode | null {
  const pref = ctx.modePref ?? "auto";
  const canDirect = p.directReady(ctx.env);
  const canHosted = Boolean(ctx.hostedKey);
  if (pref === "direct") return canDirect ? "direct" : null;
  if (pref === "hosted") return canHosted ? "hosted" : null;
  if (canDirect) return "direct";
  if (canHosted) return "hosted";
  return null;
}

/**
 * Resolve base URL + baseline headers for a provider, or null if unavailable.
 * In hosted mode the gateway namespaces each provider under `/<name>` and the
 * only client-side auth is the journio key. In direct mode the provider adds
 * its own upstream auth (api key / token) on top of these headers.
 */
export function resolveAccess(p: Provider, ctx: ProviderContext): Access | null {
  const mode = chooseMode(p, ctx);
  if (!mode) return null;
  if (mode === "hosted") {
    return {
      mode,
      baseUrl: `${hostedBase(ctx)}/${p.name}`,
      headers: ctx.hostedKey ? { Authorization: `Bearer ${ctx.hostedKey}` } : {},
    };
  }
  return { mode, baseUrl: p.upstreamBase, headers: {} };
}

export interface ProviderStatus {
  name: string;
  modes: string[];
  available: boolean;
  mode: AccessMode | null;
  /** Human-readable explanation of how (or why not) this provider is reachable. */
  source: string;
}

export function providerStatus(p: Provider, ctx: ProviderContext): ProviderStatus {
  const mode = chooseMode(p, ctx);
  const keyed = (p.needsKey?.length ?? 0) > 0;
  let source: string;
  if (mode === "direct") source = keyed ? "direct · your keys" : "direct · keyless";
  else if (mode === "hosted") source = "hosted · journio cloud";
  else source = `unavailable · set ${(p.needsKey ?? []).join(" + ") || "credentials"} or JOURNIO_KEY`;
  return { name: p.name, modes: p.modes, available: mode !== null, mode, source };
}
