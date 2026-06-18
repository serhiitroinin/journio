#!/usr/bin/env bun
// journio gateway — reference implementation of the hosted cloud service.
//
// A thin authenticating reverse proxy: clients send one journio key; the gateway
// validates it, forwards the request to the right upstream provider, injects the
// real provider credentials it holds, and meters usage. This is the minimum the
// paid service needs; production would add billing, quotas, caching, and a key
// store. Run it:
//
//   GOOGLE_MAPS_API_KEY=... AMADEUS_CLIENT_ID=... AMADEUS_CLIENT_SECRET=... \
//   JOURNIO_KEYS=jk_demo bun run gateway/server.ts
//
// Then point the CLI at it:
//
//   JOURNIO_KEY=jk_demo JOURNIO_API_URL=http://localhost:8787/v1 \
//   journio search Tirano Chur --access hosted
//
// Routing: /v1/<provider>/<upstream-path...> -> <upstream base>/<upstream-path...>

import { UPSTREAMS } from "./upstreams";

const PORT = Number(process.env.PORT || 8787);
// Comma-separated allowed keys. Empty list = allow any (dev only).
const VALID_KEYS = (process.env.JOURNIO_KEYS || "").split(",").map((s) => s.trim()).filter(Boolean);

const HOP_BY_HOP = new Set(["host", "connection", "content-length", "authorization"]);

function bearer(req: Request): string {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return Response.json({ ok: true, providers: Object.keys(UPSTREAMS) });

    const m = url.pathname.match(/^\/v1\/([^/]+)\/(.*)$/);
    if (!m) return new Response("not found", { status: 404 });
    const [, provider, rest] = m;

    const up = UPSTREAMS[provider];
    if (!up) return Response.json({ error: `unknown provider: ${provider}` }, { status: 404 });

    const key = bearer(req);
    if (VALID_KEYS.length && !VALID_KEYS.includes(key)) {
      return Response.json({ error: "invalid or missing journio key" }, { status: 401 });
    }

    const base = typeof up.base === "function" ? up.base(process.env) : up.base;
    const target = `${base}/${rest}${url.search}`;

    // Forward client headers minus hop-by-hop, then inject upstream credentials.
    const headers = new Headers();
    req.headers.forEach((v, k) => {
      if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v);
    });
    try {
      const injected = up.auth ? await up.auth(process.env, fetch) : {};
      for (const [k, v] of Object.entries(injected)) headers.set(k, v);
    } catch (err) {
      return Response.json({ error: `upstream auth failed: ${err instanceof Error ? err.message : err}` }, { status: 502 });
    }

    const init: RequestInit = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.text();

    // Meter (production: write to billing). One line per upstream call.
    console.log(`[journio] key=${key ? key.slice(0, 8) : "anon"} ${req.method} ${provider}/${rest}`);

    try {
      const res = await fetch(target, init);
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") || "application/json" },
      });
    } catch (err) {
      return Response.json({ error: `upstream fetch failed: ${err instanceof Error ? err.message : err}` }, { status: 502 });
    }
  },
});

console.log(`journio gateway listening on :${PORT}  (providers: ${Object.keys(UPSTREAMS).join(", ")})`);
console.log(VALID_KEYS.length ? `auth: ${VALID_KEYS.length} key(s) configured` : "auth: OPEN (dev mode — set JOURNIO_KEYS)");
