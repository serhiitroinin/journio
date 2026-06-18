// Swiss public transport via transport.opendata.ch.
// Free, no API key. Excellent for Switzerland incl. the Rhaetian Railway /
// Bernina Express, and resolves border stations such as Tirano and Chiasso.

import type { Journey, JourneyQuery, Leg, Mode, Provider, ProviderContext } from "../types";
import { parseDayDuration, diffMin } from "../lib/time";

const BASE = "https://transport.opendata.ch/v1";

function mapCategory(category?: string): Mode {
  if (!category) return "rail";
  const c = category.toUpperCase();
  if (c.startsWith("B") || c === "BUS") return "bus";
  if (c === "BAT" || c === "FERRY") return "ferry";
  return "rail"; // IC, IR, R, S, PE (panorama), RE, EC, TGV, ...
}

function normalize(c: any): Journey {
  const legs: Leg[] = (c.sections ?? [])
    .map((s: any): Leg | null => {
      if (s.walk && !s.journey) {
        return {
          mode: "walk",
          from: { name: s.departure?.station?.name },
          to: { name: s.arrival?.station?.name },
          departure: s.departure?.departure,
          arrival: s.arrival?.arrival,
        };
      }
      const cat = s.journey?.category;
      const num = s.journey?.number;
      return {
        mode: mapCategory(cat),
        line: s.journey?.name ?? [cat, num].filter(Boolean).join(" "),
        operator: s.journey?.operator,
        from: { name: s.departure?.station?.name },
        to: { name: s.arrival?.station?.name },
        departure: s.departure?.departure,
        arrival: s.arrival?.arrival,
      };
    })
    .filter(Boolean) as Leg[];

  const departure = c.from?.departure;
  const arrival = c.to?.arrival;
  let durationMin = parseDayDuration(c.duration);
  if (!Number.isFinite(durationMin)) durationMin = diffMin(departure, arrival);

  return {
    provider: "swiss-opendata",
    from: { name: c.from?.station?.name },
    to: { name: c.to?.station?.name },
    departure,
    arrival,
    durationMin,
    transfers: c.transfers ?? Math.max(0, legs.filter((l) => l.mode !== "walk").length - 1),
    legs,
    products: (c.products ?? []) as string[],
    price: null, // opendata.ch does not expose fares
  };
}

export const swissOpendata: Provider = {
  name: "swiss-opendata",
  modes: ["rail", "bus", "ferry"],
  available: () => true,
  async search(query: JourneyQuery, ctx: ProviderContext): Promise<Journey[]> {
    try {
      const params = new URLSearchParams({
        from: query.from,
        to: query.to,
        limit: String(query.results ?? 4),
      });
      if (query.date) params.set("date", query.date);
      if (query.time) params.set("time", query.time);
      if (query.arriveBy) params.set("isArrivalTime", "1");
      const res = await ctx.fetchJson(`${BASE}/connections?${params.toString()}`);
      const journeys = (res?.connections ?? []).map(normalize);
      if (query.includeRaw) journeys.forEach((jn: Journey, i: number) => (jn.raw = res.connections[i]));
      return journeys;
    } catch {
      return [];
    }
  },
};
