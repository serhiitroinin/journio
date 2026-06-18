// Flights via Amadeus Self-Service API (free tier).
//
// Direct (BYOK) mode: requires AMADEUS_CLIENT_ID + AMADEUS_CLIENT_SECRET; the
// provider runs the OAuth2 client-credentials flow itself. Set AMADEUS_ENV=prod
// for the production host (default is the free test host).
//
// Hosted mode: the journio gateway holds the Amadeus credentials and performs
// the token exchange server-side; the client sends only the journio key.
//
// `from`/`to` may be IATA codes (e.g. MXP, NAP) or city/airport names, which we
// resolve via the Amadeus locations endpoint.

import type { Journey, JourneyQuery, Leg, Provider, ProviderContext } from "../types";
import { diffMin, parseIsoDuration } from "../lib/time";
import { resolveAccess } from "../lib/gateway";

export function amadeusHost(env: Record<string, string | undefined>): string {
  return env.AMADEUS_ENV === "prod" ? "https://api.amadeus.com" : "https://test.api.amadeus.com";
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** OAuth2 client-credentials token. Exported so the gateway can reuse it. */
export async function amadeusToken(ctx: ProviderContext): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: ctx.env.AMADEUS_CLIENT_ID!,
    client_secret: ctx.env.AMADEUS_CLIENT_SECRET!,
  });
  const res = await ctx.fetchJson(`${amadeusHost(ctx.env)}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  cachedToken = { token: res.access_token, expiresAt: Date.now() + (res.expires_in ?? 1799) * 1000 };
  return cachedToken.token;
}

async function resolveCode(place: string, baseUrl: string, headers: Record<string, string>, ctx: ProviderContext): Promise<string | undefined> {
  if (/^[A-Z]{3}$/.test(place)) return place;
  const url = `${baseUrl}/v1/reference-data/locations?subType=CITY,AIRPORT&keyword=${encodeURIComponent(place)}&page%5Blimit%5D=1`;
  const res = await ctx.fetchJson(url, { headers });
  return res?.data?.[0]?.iataCode;
}

function normalize(offer: any, access: "direct" | "hosted"): Journey {
  const itin = offer.itineraries?.[0];
  const segs = itin?.segments ?? [];
  const legs: Leg[] = segs.map((s: any) => ({
    mode: "flight" as const,
    line: `${s.carrierCode}${s.number}`,
    operator: s.carrierCode,
    from: { name: s.departure?.iataCode, id: s.departure?.iataCode },
    to: { name: s.arrival?.iataCode, id: s.arrival?.iataCode },
    departure: s.departure?.at,
    arrival: s.arrival?.at,
  }));
  const departure = segs[0]?.departure?.at;
  const arrival = segs[segs.length - 1]?.arrival?.at;
  let durationMin = parseIsoDuration(itin?.duration);
  if (!Number.isFinite(durationMin)) durationMin = diffMin(departure, arrival);
  return {
    provider: "amadeus",
    from: legs[0]?.from ?? { name: "" },
    to: legs[legs.length - 1]?.to ?? { name: "" },
    departure,
    arrival,
    durationMin,
    transfers: Math.max(0, segs.length - 1),
    legs,
    products: [...new Set(segs.map((s: any) => s.carrierCode))] as string[],
    price: offer.price ? { amount: Number(offer.price.grandTotal ?? offer.price.total), currency: offer.price.currency } : null,
    access,
  };
}

export const amadeus: Provider = {
  name: "amadeus",
  modes: ["flight"],
  upstreamBase: "https://test.api.amadeus.com",
  needsKey: ["AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET"],
  directReady: (env) => Boolean(env.AMADEUS_CLIENT_ID && env.AMADEUS_CLIENT_SECRET),
  async search(query: JourneyQuery, ctx: ProviderContext): Promise<Journey[]> {
    const access = resolveAccess(amadeus, ctx);
    if (!access || !query.date) return [];
    try {
      // In direct mode we own the OAuth flow + host; in hosted mode the gateway
      // does both, so we just hit its namespaced base with the journio key.
      const baseUrl = access.mode === "hosted" ? access.baseUrl : amadeusHost(ctx.env);
      const headers = { ...access.headers };
      if (access.mode === "direct") headers.Authorization = `Bearer ${await amadeusToken(ctx)}`;

      const [from, to] = await Promise.all([
        resolveCode(query.from, baseUrl, headers, ctx),
        resolveCode(query.to, baseUrl, headers, ctx),
      ]);
      if (!from || !to) return [];
      const params = new URLSearchParams({
        originLocationCode: from,
        destinationLocationCode: to,
        departureDate: query.date,
        adults: "1",
        max: String(query.results ?? 5),
        currencyCode: ctx.env.JOURNIO_CURRENCY ?? "EUR",
      });
      const res = await ctx.fetchJson(`${baseUrl}/v2/shopping/flight-offers?${params.toString()}`, { headers });
      const journeys = (res?.data ?? []).map((o: any) => normalize(o, access.mode));
      if (query.includeRaw) journeys.forEach((jn: Journey, i: number) => (jn.raw = res.data[i]));
      return journeys;
    } catch {
      return [];
    }
  },
};
