// Upstream registry for the journio gateway (the cloud side).
//
// Maps each provider namespace to its real upstream API and the credentials the
// gateway injects server-side. This is the one place the cloud holds real keys;
// clients only ever send their single journio key.
//
// Mirrors the `upstreamBase` declared by each provider in src/providers/*. Kept
// separate so the gateway can be deployed independently of the CLI.

export interface Upstream {
  /** Upstream base URL, or a function of the gateway's env. */
  base: string | ((env: Env) => string);
  /** Headers the gateway injects (real provider keys). May be async (OAuth). */
  auth?: (env: Env, fetchFn: typeof fetch) => Promise<Record<string, string>> | Record<string, string>;
}

type Env = Record<string, string | undefined>;

let amadeusTok: { token: string; expiresAt: number } | null = null;

async function amadeusInject(env: Env, fetchFn: typeof fetch): Promise<Record<string, string>> {
  const host = env.AMADEUS_ENV === "prod" ? "https://api.amadeus.com" : "https://test.api.amadeus.com";
  if (!amadeusTok || amadeusTok.expiresAt < Date.now() + 30_000) {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.AMADEUS_CLIENT_ID ?? "",
      client_secret: env.AMADEUS_CLIENT_SECRET ?? "",
    });
    const res = await fetchFn(`${host}/v1/security/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const json: any = await res.json();
    amadeusTok = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 1799) * 1000 };
  }
  return { Authorization: `Bearer ${amadeusTok.token}` };
}

export const UPSTREAMS: Record<string, Upstream> = {
  "transport-rest": { base: "https://v6.db.transport.rest" },
  "swiss-opendata": { base: "https://transport.opendata.ch/v1" },
  "google-routes": {
    base: "https://routes.googleapis.com",
    auth: (env) => (env.GOOGLE_MAPS_API_KEY ? { "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY } : {}),
  },
  amadeus: {
    base: (env) => (env.AMADEUS_ENV === "prod" ? "https://api.amadeus.com" : "https://test.api.amadeus.com"),
    auth: amadeusInject,
  },
};
