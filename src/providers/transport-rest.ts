// Deutsche Bahn HAFAS via transport.rest (https://v6.db.transport.rest).
// Free, no API key. Strong for Germany + cross-border European long-distance
// (incl. many TGV/EC/ICE/RJ services). Reflects live disruptions. Weak for
// purely-domestic Italian and Spanish networks.

import type { Journey, JourneyQuery, Leg, Mode, Provider, ProviderContext } from "../types";
import { diffMin, toIsoLocal } from "../lib/time";
import { resolveAccess } from "../lib/gateway";

export const UPSTREAM = "https://v6.db.transport.rest";

function mapProduct(product?: string): Mode {
  switch (product) {
    case "bus":
      return "bus";
    case "ferry":
      return "ferry";
    case "taxi":
      return "drive";
    default:
      return "rail"; // nationalExpress, national, regionalExpress, regional, suburban, tram, subway
  }
}

async function geocode(baseUrl: string, headers: Record<string, string>, name: string, ctx: ProviderContext): Promise<string | undefined> {
  const url = `${baseUrl}/locations?query=${encodeURIComponent(name)}&results=1&poi=false&addresses=false`;
  const res = await ctx.fetchJson(url, { headers });
  const first = Array.isArray(res) ? res[0] : undefined;
  return first?.id;
}

function normalize(j: any, access: "direct" | "hosted"): Journey {
  const legs: Leg[] = (j.legs ?? []).map((l: any) => ({
    mode: l.walking ? "walk" : mapProduct(l.line?.product),
    line: l.line?.name,
    operator: l.line?.operator?.name,
    from: { name: l.origin?.name, id: l.origin?.id },
    to: { name: l.destination?.name, id: l.destination?.id },
    departure: l.departure ?? l.plannedDeparture,
    arrival: l.arrival ?? l.plannedArrival,
  }));
  const transportLegs = legs.filter((l) => l.mode !== "walk");
  const first = legs[0];
  const last = legs[legs.length - 1];
  const departure = first?.departure;
  const arrival = last?.arrival;
  const products = [...new Set((j.legs ?? []).map((l: any) => l.line?.product).filter(Boolean))] as string[];
  return {
    provider: "transport-rest",
    from: first?.from ?? { name: "" },
    to: last?.to ?? { name: "" },
    departure,
    arrival,
    durationMin: diffMin(departure, arrival),
    transfers: Math.max(0, transportLegs.length - 1),
    legs,
    products,
    price: j.price?.amount != null ? { amount: j.price.amount, currency: j.price.currency ?? "EUR" } : null,
    access,
  };
}

export const transportRest: Provider = {
  name: "transport-rest",
  modes: ["rail", "bus", "ferry"],
  upstreamBase: UPSTREAM,
  directReady: () => true, // keyless upstream
  async search(query: JourneyQuery, ctx: ProviderContext): Promise<Journey[]> {
    const access = resolveAccess(transportRest, ctx);
    if (!access) return [];
    try {
      const { baseUrl, headers } = access;
      const [fromId, toId] = await Promise.all([geocode(baseUrl, headers, query.from, ctx), geocode(baseUrl, headers, query.to, ctx)]);
      if (!fromId || !toId) return [];
      const params = new URLSearchParams({
        from: fromId,
        to: toId,
        results: String(query.results ?? 4),
        stopovers: "false",
        remarks: "false",
      });
      const when = toIsoLocal(query.date, query.time);
      if (when) params.set(query.arriveBy ? "arrival" : "departure", when);
      const res = await ctx.fetchJson(`${baseUrl}/journeys?${params.toString()}`, { headers });
      const journeys = (res?.journeys ?? []).map((j: any) => normalize(j, access.mode));
      if (query.includeRaw) journeys.forEach((jn: Journey, i: number) => (jn.raw = res.journeys[i]));
      return journeys;
    } catch {
      return [];
    }
  },
};
