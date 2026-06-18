// Driving estimates via Google Routes API (computeRoutes).
//
// Direct (BYOK) mode: requires GOOGLE_MAPS_API_KEY (sent as X-Goog-Api-Key).
// Hosted mode: the journio gateway injects the key; the client sends only the
// journio key. Returns a single schedule-less drive leg with duration/distance
// — useful for last-mile legs like Naples -> Positano where no transit API helps.

import type { Journey, JourneyQuery, Leg, Provider, ProviderContext } from "../types";
import { parseIsoDuration } from "../lib/time";
import { resolveAccess } from "../lib/gateway";

export const UPSTREAM = "https://routes.googleapis.com";

function normalize(route: any, query: JourneyQuery, access: "direct" | "hosted"): Journey {
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
    access,
  };
}

export const googleRoutes: Provider = {
  name: "google-routes",
  modes: ["drive"],
  upstreamBase: UPSTREAM,
  needsKey: ["GOOGLE_MAPS_API_KEY"],
  directReady: (env) => Boolean(env.GOOGLE_MAPS_API_KEY),
  async search(query: JourneyQuery, ctx: ProviderContext): Promise<Journey[]> {
    const access = resolveAccess(googleRoutes, ctx);
    if (!access) return [];
    try {
      const headers: Record<string, string> = {
        ...access.headers,
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      };
      if (access.mode === "direct") headers["X-Goog-Api-Key"] = ctx.env.GOOGLE_MAPS_API_KEY!;
      const res = await ctx.fetchJson(`${access.baseUrl}/directions/v2:computeRoutes`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          origin: { address: query.from },
          destination: { address: query.to },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        }),
      });
      const journeys = (res?.routes ?? []).map((r: any) => normalize(r, query, access.mode));
      if (query.includeRaw) journeys.forEach((jn: Journey, i: number) => (jn.raw = res.routes[i]));
      return journeys;
    } catch {
      return [];
    }
  },
};
