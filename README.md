# journio

Multi-provider journey planner CLI — for humans **and agents**.

Plan multi-leg, multi-country trips by querying several travel data providers
through one normalized model. Built on [Bun](https://bun.sh). The core has **zero
runtime dependencies**.

Two ways to authenticate:
- **Bring your own keys (BYOK)** — set each upstream's keys in your env; free.
- **One journio cloud key** — a single key routes to every provider under the
  hood, billed centrally. Pay for convenience instead of juggling accounts.

…and you can mix: keep keys for the providers you have, rent the rest.

```
journio search "Tirano" "Chur" --date 2026-07-10 --time 08:00
journio search Milano Napoli --mode flight --key jk_live_... --access hosted
journio plan examples/europe-2026.json --out plan.md
journio providers
```

## Why

No single API covers a whole European trip. Operators like Trenitalia, Italo,
Renfe, and every ferry company keep schedules behind closed B2B partner APIs.
journio aggregates the good *open* sources, normalizes them, and is honest about
the gaps — legs with no coverage are flagged `⚠`, manual legs (ferries, domestic
IT/ES rail) are flagged `✎`. Agents get the full structured model via `--json`.

## Install

```bash
bun install          # dev deps only (types, tsc)
bun link             # optional: expose `journio` globally
```

Run without linking: `bun run src/cli.ts <command>`.

## Commands

| Command | What it does |
|---|---|
| `search <from> <to>` | Query one leg across all applicable providers |
| `plan <file.json\|yaml>` | Resolve a whole itinerary leg-by-leg |
| `providers` | List providers, their modes, and how each is reached (direct/hosted) |

Common flags: `--date YYYY-MM-DD`, `--time HH:MM`, `--arrive-by`, `--mode`
(transport mode), `--providers a,b`, `--results N`, `--json`, `--raw`, `--out FILE`.

## Auth: BYOK vs hosted cloud

journio resolves an **access mode per provider** so you only pay for what you
can't already do for free:

| `--access` | Behavior |
|---|---|
| `auto` (default) | Per provider: use your own key (or a keyless upstream) if possible; otherwise route via the journio cloud if `--key`/`JOURNIO_KEY` is set; otherwise mark unavailable. |
| `direct` | BYOK only — never touch the cloud. Keyed providers need their env keys. |
| `hosted` | Cloud only — route **everything** through the journio gateway with one key. |

Auth flags / env:

| Flag | Env | Meaning |
|---|---|---|
| `--key` | `JOURNIO_KEY` | Your journio cloud key (enables hosted access) |
| `--access` | `JOURNIO_MODE` | `auto` \| `direct` \| `hosted` |
| `--api-url` | `JOURNIO_API_URL` | Gateway base URL (default `https://api.journio.dev/v1`) |

Direct-mode upstream keys come from the usual env vars (`AMADEUS_CLIENT_ID`,
`AMADEUS_CLIENT_SECRET`, `GOOGLE_MAPS_API_KEY`). `journio providers` shows exactly
how each provider will be reached (`direct · keyless`, `direct · your keys`,
`hosted · journio cloud`, or `unavailable`). Each `Journey` carries an `access`
field (`direct`/`hosted`) so you can see — and cost — where every result came from.

## Hosted gateway (the cloud service)

`gateway/` is a reference implementation of the paid service: a thin
authenticating reverse proxy. It validates the journio key, forwards
`/v1/<provider>/<upstream-path>` to the real upstream, injects the provider
credentials it holds, and meters usage. Run it locally:

```bash
# terminal 1 — the gateway (holds the real upstream keys)
GOOGLE_MAPS_API_KEY=… AMADEUS_CLIENT_ID=… AMADEUS_CLIENT_SECRET=… \
JOURNIO_KEYS=jk_demo bun run gateway

# terminal 2 — the CLI, with just the one journio key
JOURNIO_KEY=jk_demo JOURNIO_API_URL=http://localhost:8787/v1 \
  journio search Tirano Chur --access hosted
```

Production would add billing, quotas, caching, and a real key store on top.

### For agents

Every command supports `--json`, emitting the normalized `Journey[]` /
`PlannedItinerary` model (see `src/types.ts`). `plan --json` returns each leg with
a `status` of `ok` | `no-coverage` | `manual`, the providers tried, and ranked
journeys — enough to drive booking decisions programmatically.

## Providers

| Provider | Modes | Direct-mode key | Coverage |
|---|---|---|---|
| `transport-rest` | rail, bus, ferry | none (keyless) | DB HAFAS — Germany + cross-border EU long-distance; live disruptions |
| `swiss-opendata` | rail, bus, ferry | none (keyless) | Switzerland incl. Bernina/RhB; border stations (Tirano…) |
| `amadeus` | flight | `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET` | Global flight offers (free Self-Service tier) |
| `google-routes` | drive | `GOOGLE_MAPS_API_KEY` | Driving time/distance for last-mile legs |

In hosted mode any of these can be reached with just the journio key instead.
Known gaps (always manual): ferries, Italian and Spanish *domestic* rail.

## Itineraries

JSON works out of the box. YAML works after `bun add yaml`.

```json
{
  "title": "My trip",
  "defaults": { "results": 4 },
  "legs": [
    { "from": "Tirano", "to": "Chur", "date": "2026-07-10", "time": "08:00", "mode": "rail" },
    { "from": "Napoli", "to": "Positano", "mode": "ferry", "manual": true, "note": "book on operator site" }
  ]
}
```

## Extending: add a provider

1. Create `src/providers/<name>.ts` exporting a `Provider` (see `src/types.ts`):
   set `upstreamBase`, implement `directReady(env)` (return `true` for keyless
   upstreams, or check the env keys), and `search(query, ctx)`. Call
   `resolveAccess(thisProvider, ctx)` to get the right base URL + headers for the
   chosen mode, normalize the response into `Journey[]`, and **never throw**
   (return `[]` on failure). Set `journey.access = access.mode`.
2. Register it in `src/registry.ts` (`ALL_PROVIDERS`).
3. Add `gateway/upstreams.ts` entry so the hosted gateway can proxy it (base URL
   + any server-side credential injector).
4. Add a unit test in `tests/` using a mock `fetchJson` (see `tests/providers.test.ts`).

That's it — the planner, CLI, formatters, and both auth modes pick it up
automatically. Providers receive `fetchJson` and `env` through `ProviderContext`,
so they're trivially testable and never touch globals.

## Develop

```bash
bun test         # unit tests (mocked HTTP, no network)
bun run typecheck
```

## License

MIT
