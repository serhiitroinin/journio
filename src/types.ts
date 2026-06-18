// Core domain model for journio.
//
// Every provider normalizes its native API response into these shapes, so the
// CLI, planner, and formatters never need to know which backend produced a
// result. To add a new backend you only implement the `Provider` interface.

export type Mode = "rail" | "flight" | "bus" | "drive" | "ferry" | "walk";

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

/** Dependencies handed to a provider — injected so providers stay testable. */
export interface ProviderContext {
  fetchJson: (url: string, init?: RequestInit) => Promise<any>;
  env: Record<string, string | undefined>;
}

export interface Provider {
  /** Stable short id, shown in output and used by --providers filtering. */
  name: string;
  /** Modes this provider can return. */
  modes: Mode[];
  /** Env var names required to enable the provider; omit/empty if none. */
  needsKey?: string[];
  /** True when the provider can run given the current environment. */
  available(ctx: ProviderContext): boolean;
  /** Query the backend and return normalized journeys. Must never throw. */
  search(query: JourneyQuery, ctx: ProviderContext): Promise<Journey[]>;
}
