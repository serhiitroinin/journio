import { describe, expect, test } from "bun:test";
import type { ProviderContext } from "../src/types";
import { transportRest } from "../src/providers/transport-rest";
import { swissOpendata } from "../src/providers/swiss-opendata";
import { amadeus } from "../src/providers/amadeus";
import { googleRoutes } from "../src/providers/google-routes";

/** Build a ProviderContext whose fetchJson matches a URL substring to a payload. */
function mockCtx(routes: Record<string, any>, env: Record<string, string | undefined> = {}): ProviderContext {
  return {
    env,
    async fetchJson(url: string) {
      for (const key of Object.keys(routes)) {
        if (url.includes(key)) return routes[key];
      }
      throw new Error(`no mock for ${url}`);
    },
  };
}

describe("transport-rest", () => {
  test("normalizes a journey with transfers and products", async () => {
    const ctx = mockCtx({
      "query=Chur": [{ id: "8509000", name: "Chur" }],
      "query=Paris": [{ id: "8700011", name: "Paris" }],
      "/journeys?": {
        journeys: [
          {
            legs: [
              {
                origin: { name: "Chur", id: "8509000" },
                destination: { name: "Basel SBB", id: "8500010" },
                departure: "2026-07-12T08:00:00+02:00",
                arrival: "2026-07-12T10:00:00+02:00",
                line: { name: "IC 3", product: "national" },
              },
              {
                origin: { name: "Basel SBB" },
                destination: { name: "Paris Est" },
                departure: "2026-07-12T10:30:00+02:00",
                arrival: "2026-07-12T13:30:00+02:00",
                line: { name: "TGV 9211", product: "nationalExpress" },
              },
            ],
            price: { amount: 89.9, currency: "EUR" },
          },
        ],
      },
    });
    const [j] = await transportRest.search({ from: "Chur", to: "Paris" }, ctx);
    expect(j.provider).toBe("transport-rest");
    expect(j.transfers).toBe(1);
    expect(j.durationMin).toBe(330);
    expect(j.products).toEqual(["national", "nationalExpress"]);
    expect(j.price).toEqual({ amount: 89.9, currency: "EUR" });
    expect(j.legs[1].mode).toBe("rail");
  });

  test("returns [] when geocoding fails", async () => {
    const ctx = mockCtx({ "query=": [] });
    expect(await transportRest.search({ from: "Nowhere", to: "Void" }, ctx)).toEqual([]);
  });

  test("never throws on backend error", async () => {
    const ctx = mockCtx({});
    expect(await transportRest.search({ from: "A", to: "B" }, ctx)).toEqual([]);
  });
});

describe("swiss-opendata", () => {
  test("normalizes a Bernina connection and parses duration", async () => {
    const ctx = mockCtx({
      "/connections?": {
        connections: [
          {
            from: { station: { name: "Tirano" }, departure: "2026-07-10T08:24:00+02:00" },
            to: { station: { name: "Chur" }, arrival: "2026-07-10T12:31:00+02:00" },
            duration: "00d04:07:00",
            transfers: 0,
            products: ["PE"],
            sections: [
              {
                departure: { station: { name: "Tirano" }, departure: "2026-07-10T08:24:00+02:00" },
                arrival: { station: { name: "Chur" }, arrival: "2026-07-10T12:31:00+02:00" },
                journey: { category: "PE", number: "973", name: "PE 973" },
              },
            ],
          },
        ],
      },
    });
    const [j] = await swissOpendata.search({ from: "Tirano", to: "Chur" }, ctx);
    expect(j.durationMin).toBe(247);
    expect(j.transfers).toBe(0);
    expect(j.products).toEqual(["PE"]);
    expect(j.legs[0].line).toBe("PE 973");
  });
});

describe("amadeus", () => {
  test("disabled without keys", () => {
    expect(amadeus.available(mockCtx({}))).toBe(false);
    expect(amadeus.available(mockCtx({}, { AMADEUS_CLIENT_ID: "x", AMADEUS_CLIENT_SECRET: "y" }))).toBe(true);
  });

  test("normalizes a flight offer (token + IATA codes)", async () => {
    const ctx = mockCtx(
      {
        "/security/oauth2/token": { access_token: "tok", expires_in: 1799 },
        "/v2/shopping/flight-offers": {
          data: [
            {
              itineraries: [
                {
                  duration: "PT1H20M",
                  segments: [
                    {
                      carrierCode: "AZ",
                      number: "1267",
                      departure: { iataCode: "MXP", at: "2026-07-06T08:00:00" },
                      arrival: { iataCode: "NAP", at: "2026-07-06T09:20:00" },
                    },
                  ],
                },
              ],
              price: { grandTotal: "59.99", currency: "EUR" },
            },
          ],
        },
      },
      { AMADEUS_CLIENT_ID: "x", AMADEUS_CLIENT_SECRET: "y" },
    );
    const [j] = await amadeus.search({ from: "MXP", to: "NAP", date: "2026-07-06" }, ctx);
    expect(j.provider).toBe("amadeus");
    expect(j.durationMin).toBe(80);
    expect(j.transfers).toBe(0);
    expect(j.price).toEqual({ amount: 59.99, currency: "EUR" });
    expect(j.legs[0].mode).toBe("flight");
  });
});

describe("google-routes", () => {
  test("disabled without key; normalizes a drive", async () => {
    expect(googleRoutes.available(mockCtx({}))).toBe(false);
    const ctx = mockCtx(
      { "directions/v2:computeRoutes": { routes: [{ duration: "5400s", distanceMeters: 58000 }] } },
      { GOOGLE_MAPS_API_KEY: "k" },
    );
    const [j] = await googleRoutes.search({ from: "Napoli", to: "Positano" }, ctx);
    expect(j.durationMin).toBe(90);
    expect(j.legs[0].mode).toBe("drive");
    expect(j.legs[0].line).toBe("Drive ~58 km");
  });
});
