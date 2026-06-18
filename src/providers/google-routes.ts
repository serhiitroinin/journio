// Driving estimates via Google Routes API (computeRoutes).
// Requires GOOGLE_MAPS_API_KEY. Returns a single schedule-less drive leg with a
// duration and distance — useful for last-mile legs like Naples -> Positano,
// where no public transit API helps.

import type { Journey, JourneyQuery, Leg, Provider, ProviderContext } from "../types";
import { parseIsoDuration } from "../lib/time";

const URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

function normalize(route: any, query: JourneyQuery): Journey {
  const durationMin = parseIsoDuration(route?.duration);
  const km = route?.distanceMeters ? Math.round(route.distanceMeters / 1000) : undefined;
  const leg: Leg = {
    mode: "drive",
    line: km != null ? `Drive ~${km} km` : "Drive",
    from: { name: query.from },
    to: { name: query.to },
  };
  return {
    provider: "google-routes",
    from: { name: query.from },
    to: { name: query.to },
    durationMin,
    transfers: 0,
    legs: [leg],
    products: ["drive"],
    price: null,
  };
}

export const googleRoutes: Provider = {
  name: "google-routes",
  modes: ["drive"],
  needsKey: ["GOOGLE_MAPS_API_KEY"],
  available: (ctx) => Boolean(ctx.env.GOOGLE_MAPS_API_KEY),
  async search(query: JourneyQuery, ctx: ProviderContext): Promise<Journey[]> {
    try {
      const res = await ctx.fetchJson(URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": ctx.env.GOOGLE_MAPS_API_KEY!,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
        },
        body: JSON.stringify({
          origin: { address: query.from },
          destination: { address: query.to },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        }),
      });
      const journeys = (res?.routes ?? []).map((r: any) => normalize(r, query));
      if (query.includeRaw) journeys.forEach((jn: Journey, i: number) => (jn.raw = res.routes[i]));
      return journeys;
    } catch {
      return [];
    }
  },
};
