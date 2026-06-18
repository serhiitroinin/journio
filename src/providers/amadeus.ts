// Flights via Amadeus Self-Service API (free tier).
// Requires AMADEUS_CLIENT_ID + AMADEUS_CLIENT_SECRET. Set AMADEUS_ENV=prod to
// use the production host (default is the free test host).
//
// `from`/`to` may be IATA codes (e.g. MXP, NAP) or city/airport names, which we
// resolve via the Amadeus locations endpoint.

import type { Journey, JourneyQuery, Leg, Provider, ProviderContext } from "../types";
import { diffMin, parseIsoDuration } from "../lib/time";

function host(ctx: ProviderContext): string {
  return ctx.env.AMADEUS_ENV === "prod" ? "https://api.amadeus.com" : "https://test.api.amadeus.com";
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(ctx: ProviderContext): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: ctx.env.AMADEUS_CLIENT_ID!,
    client_secret: ctx.env.AMADEUS_CLIENT_SECRET!,
  });
  const res = await ctx.fetchJson(`${host(ctx)}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  cachedToken = { token: res.access_token, expiresAt: Date.now() + (res.expires_in ?? 1799) * 1000 };
  return cachedToken.token;
}

async function resolveCode(place: string, token: string, ctx: ProviderContext): Promise<string | undefined> {
  if (/^[A-Z]{3}$/.test(place)) return place;
  const url = `${host(ctx)}/v1/reference-data/locations?subType=CITY,AIRPORT&keyword=${encodeURIComponent(place)}&page%5Blimit%5D=1`;
  const res = await ctx.fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
  return res?.data?.[0]?.iataCode;
}

function normalize(offer: any): Journey {
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
  };
}

export const amadeus: Provider = {
  name: "amadeus",
  modes: ["flight"],
  needsKey: ["AMADEUS_CLIENT_ID", "AMADEUS_CLIENT_SECRET"],
  available: (ctx) => Boolean(ctx.env.AMADEUS_CLIENT_ID && ctx.env.AMADEUS_CLIENT_SECRET),
  async search(query: JourneyQuery, ctx: ProviderContext): Promise<Journey[]> {
    try {
      if (!query.date) return [];
      const token = await getToken(ctx);
      const [from, to] = await Promise.all([resolveCode(query.from, token, ctx), resolveCode(query.to, token, ctx)]);
      if (!from || !to) return [];
      const params = new URLSearchParams({
        originLocationCode: from,
        destinationLocationCode: to,
        departureDate: query.date,
        adults: "1",
        max: String(query.results ?? 5),
        currencyCode: ctx.env.JOURNIO_CURRENCY ?? "EUR",
      });
      const res = await ctx.fetchJson(`${host(ctx)}/v2/shopping/flight-offers?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const journeys = (res?.data ?? []).map(normalize);
      if (query.includeRaw) journeys.forEach((jn: Journey, i: number) => (jn.raw = res.data[i]));
      return journeys;
    } catch {
      return [];
    }
  },
};
