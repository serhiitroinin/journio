# journio

Multi-provider journey planner CLI — for humans **and agents**.

Plan multi-leg, multi-country trips by querying several travel data providers
through one normalized model. Built on [Bun](https://bun.sh). The core has **zero
runtime dependencies**; keyed providers light up when you add credentials.

```
journio search "Tirano" "Chur" --date 2026-07-10 --time 08:00
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
| `providers` | List providers, their modes, and key status |

Common flags: `--date YYYY-MM-DD`, `--time HH:MM`, `--arrive-by`, `--mode`,
`--providers a,b`, `--results N`, `--json`, `--raw`, `--out FILE`.

### For agents

Every command supports `--json`, emitting the normalized `Journey[]` /
`PlannedItinerary` model (see `src/types.ts`). `plan --json` returns each leg with
a `status` of `ok` | `no-coverage` | `manual`, the providers tried, and ranked
journeys — enough to drive booking decisions programmatically.

## Providers

| Provider | Modes | Key | Coverage |
|---|---|---|---|
| `transport-rest` | rail, bus, ferry | none | DB HAFAS — Germany + cross-border EU long-distance; live disruptions |
| `swiss-opendata` | rail, bus, ferry | none | Switzerland incl. Bernina/RhB; border stations (Tirano…) |
| `amadeus` | flight | `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET` | Global flight offers (free Self-Service tier) |
| `google-routes` | drive | `GOOGLE_MAPS_API_KEY` | Driving time/distance for last-mile legs |

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

1. Create `src/providers/<name>.ts` exporting a `Provider` (see `src/types.ts`).
   Implement `available(ctx)` and `search(query, ctx)` — normalize the backend's
   response into `Journey[]`, and **never throw** (return `[]` on failure).
2. Register it in `src/registry.ts` (`ALL_PROVIDERS`).
3. Add a unit test in `tests/` using a mock `fetchJson` (see `tests/providers.test.ts`).

That's it — the planner, CLI, and formatters pick it up automatically. Providers
receive `fetchJson` and `env` through `ProviderContext`, so they're trivially
testable and never touch globals.

## Develop

```bash
bun test         # unit tests (mocked HTTP, no network)
bun run typecheck
```

## License

MIT
