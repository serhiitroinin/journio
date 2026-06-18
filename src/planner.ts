// Orchestration: run the right providers for a single query, and walk a whole
// itinerary leg-by-leg. Providers run concurrently; a provider that errors or
// returns nothing simply contributes no journeys (it never throws).

import type { Journey, JourneyQuery, Mode, Provider, ProviderContext } from "./types";
import { ALL_PROVIDERS } from "./registry";
import { chooseMode } from "./lib/gateway";

export interface SearchOptions {
  /** Restrict to these modes (default: all). */
  mode?: Mode;
  /** Restrict to these provider names (default: all available). */
  providers?: string[];
}

function pickProviders(ctx: ProviderContext, opts: SearchOptions): Provider[] {
  return ALL_PROVIDERS.filter((p) => {
    if (chooseMode(p, ctx) === null) return false; // unavailable in current auth mode
    if (opts.providers && !opts.providers.includes(p.name)) return false;
    if (opts.mode && !p.modes.includes(opts.mode)) return false;
    return true;
  });
}

function byDeparture(a: Journey, b: Journey): number {
  if (a.departure && b.departure) return a.departure.localeCompare(b.departure);
  return a.durationMin - b.durationMin;
}

export async function search(query: JourneyQuery, ctx: ProviderContext, opts: SearchOptions = {}): Promise<Journey[]> {
  const providers = pickProviders(ctx, opts);
  const results = await Promise.all(providers.map((p) => p.search(query, ctx)));
  return results.flat().sort(byDeparture);
}

// ---- Itinerary planning -------------------------------------------------

export interface ItineraryLeg {
  from: string;
  to: string;
  date?: string;
  time?: string;
  mode?: Mode;
  /** Skip API lookups; just carry a note (e.g. ferries, no-coverage legs). */
  manual?: boolean;
  note?: string;
  providers?: string[];
}

export interface Itinerary {
  title?: string;
  defaults?: { results?: number };
  legs: ItineraryLeg[];
}

export type LegStatus = "ok" | "no-coverage" | "manual";

export interface PlannedLeg {
  leg: ItineraryLeg;
  status: LegStatus;
  providersTried: string[];
  journeys: Journey[];
}

export interface PlannedItinerary {
  title: string;
  legs: PlannedLeg[];
}

/** Modes that no current provider can resolve — always treated as manual. */
const MANUAL_MODES: Mode[] = ["ferry", "walk"];

export async function plan(itin: Itinerary, ctx: ProviderContext, includeRaw = false): Promise<PlannedItinerary> {
  const legs: PlannedLeg[] = [];
  for (const leg of itin.legs) {
    const forcedManual = leg.manual || (leg.mode != null && MANUAL_MODES.includes(leg.mode));
    if (forcedManual) {
      legs.push({ leg, status: "manual", providersTried: [], journeys: [] });
      continue;
    }
    const opts: SearchOptions = { mode: leg.mode, providers: leg.providers };
    const providersTried = pickProviders(ctx, opts).map((p) => p.name);
    const journeys = await search(
      {
        from: leg.from,
        to: leg.to,
        date: leg.date,
        time: leg.time,
        results: itin.defaults?.results,
        includeRaw,
      },
      ctx,
      opts,
    );
    legs.push({
      leg,
      status: journeys.length > 0 ? "ok" : "no-coverage",
      providersTried,
      journeys,
    });
  }
  return { title: itin.title ?? "Trip plan", legs };
}
