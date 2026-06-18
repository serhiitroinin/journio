// Core domain model for journio.
//
// Every provider normalizes its native API response into these shapes, so the
// CLI, planner, and formatters never need to know which backend produced a
// result. To add a new backend you only implement the `Provider` interface.

export type Mode = "rail" | "flight" | "bus" | "drive" | "ferry" | "walk";

/** How a provider's request reaches the upstream API. */
export type AccessMode = "direct" | "hosted";

/** User preference for access mode. `auto` picks per provider (see gateway). */
export type ModePref = "auto" | "direct" | "hosted";

export interface Place {
  name: string;
  /** Provider-native station/stop id, when known. */
  id?: string;
  lat?: number;
  lon?: number;
  /** ISO country code, when known. */
  country?: string;
}

/** A single uninterrupted segment of a journey (one train, one flight, ...). */
export interface Leg {
  mode: Mode;
  /** Human label, e.g. "Frecciarossa 9617", "Bernina Express", "TGV 9711". */
  line?: string;
  operator?: string;
  from: Place;
  to: Place;
  /** ISO 8601 with offset. Absent for schedule-less modes (e.g. driving). */
  departure?: string;
  arrival?: string;
}

export interface Price {
  amount: number;
  currency: string;
}

/** A normalized end-to-end option returned by a provider. */
export interface Journey {
  provider: string;
  from: Place;
  to: Place;
  departure?: string;
  arrival?: string;
  durationMin: number;
  transfers: number;
  legs: Leg[];
  /** Coarse product labels, e.g. ["PE"], ["TGV"], ["nationalExpress"]. */
  products: string[];
  price?: Price | null;
  /** Which access path produced this result (BYOK vs hosted cloud). */
  access?: AccessMode;
  /** Original provider payload, only populated when the caller asks for it. */
  raw?: unknown;
}

export interface JourneyQuery {
  from: string;
  to: string;
  /** YYYY-MM-DD. */
  date?: string;
  /** HH:MM, interpreted as "depart at or after". */
  time?: string;
  /** Treat `time` as a latest-arrival constraint instead of earliest-departure. */
  arriveBy?: boolean;
  results?: number;
  /** Keep provider raw payloads on returned journeys. */
  includeRaw?: boolean;
}

/**
 * Dependencies handed to a provider — injected so providers stay testable.
 *
 * Auth model:
 *  - `env` holds the user's own upstream API keys (BYOK / direct mode).
 *  - `hostedKey` is a single journio cloud key; when set, providers may route
 *    through the gateway at `hostedBaseUrl` instead of holding upstream keys.
 *  - `modePref` controls the choice (see src/lib/gateway.ts).
 */
export interface ProviderContext {
  fetchJson: (url: string, init?: RequestInit) => Promise<any>;
  env: Record<string, string | undefined>;
  /** journio cloud key; enables hosted access when present. */
  hostedKey?: string;
  /** Gateway base URL (default https://api.journio.dev/v1). */
  hostedBaseUrl?: string;
  /** auto (default) | direct (BYOK only) | hosted (cloud only). */
  modePref?: ModePref;
}

export interface Provider {
  /** Stable short id; shown in output, used by --providers, and as the gateway namespace. */
  name: string;
  /** Modes this provider can return. */
  modes: Mode[];
  /** Upstream API base URL used in direct (BYOK) mode. */
  upstreamBase: string;
  /** Env var names required for direct mode; omit/empty when the upstream is keyless. */
  needsKey?: string[];
  /** True when direct mode can run (keyless upstream, or required env keys present). */
  directReady(env: Record<string, string | undefined>): boolean;
  /** Query the backend and return normalized journeys. Must never throw. */
  search(query: JourneyQuery, ctx: ProviderContext): Promise<Journey[]>;
}
