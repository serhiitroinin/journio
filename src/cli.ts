#!/usr/bin/env bun
// journio — multi-provider journey planner for humans and agents.

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import type { Mode, ModePref, ProviderContext } from "./types";
import { ALL_PROVIDERS, defaultContext } from "./registry";
import { providerStatus } from "./lib/gateway";
import { plan as planItinerary, search, type Itinerary } from "./planner";
import { journeysTable, planMarkdown } from "./format";

const HELP = `journio — multi-provider journey planner

USAGE
  journio search <from> <to> [options]   Search one leg across all providers
  journio plan <itinerary.json|yaml>     Resolve a whole itinerary
  journio providers                      List providers and how they're reached

OPTIONS
  --date YYYY-MM-DD   Travel date
  --time HH:MM        Depart at/after (or arrive-by with --arrive-by)
  --arrive-by         Treat --time as latest arrival
  --mode MODE         Transport mode: rail | flight | bus | drive | ferry
  --providers a,b     Restrict to named providers
  --results N         Max results per provider (default 4)
  --json              Machine-readable JSON (for agents)
  --raw               Include providers' raw payloads in JSON
  --out FILE          Write plan markdown to FILE
  --help

AUTH (bring-your-own-keys vs hosted journio cloud)
  --key KEY           journio cloud key (or env JOURNIO_KEY) — one key, all providers
  --access MODE       auto (default) | direct (your keys only) | hosted (cloud only)
  --api-url URL       Gateway base URL (or env JOURNIO_API_URL)
                      Direct mode reads upstream keys from env (AMADEUS_*, GOOGLE_MAPS_API_KEY).

EXAMPLES
  journio search "Tirano" "Chur" --date 2026-07-10 --time 08:00
  journio search Milano Napoli --mode rail --json
  journio search Milano Napoli --mode flight --key jk_live_... --access hosted
  journio plan examples/europe-2026.json --out plan.md`;

async function loadItinerary(path: string): Promise<Itinerary> {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".json")) return JSON.parse(text);
  // YAML support is optional — only needed if you use .yaml itineraries.
  try {
    // @ts-ignore optional peer dependency, present only after `bun add yaml`
    const YAML = await import("yaml");
    return YAML.parse(text);
  } catch {
    throw new Error(`To read YAML itineraries, run \`bun add yaml\` (or use a .json file). File: ${path}`);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    allowPositionals: true,
    options: {
      date: { type: "string" },
      time: { type: "string" },
      "arrive-by": { type: "boolean" },
      mode: { type: "string" },
      providers: { type: "string" },
      results: { type: "string" },
      json: { type: "boolean" },
      raw: { type: "boolean" },
      out: { type: "string" },
      key: { type: "string" },
      access: { type: "string" },
      "api-url": { type: "string" },
      help: { type: "boolean" },
    },
  });

  const [cmd, ...rest] = positionals;
  if (values.help || !cmd) {
    console.log(HELP);
    return;
  }

  // CLI flags override env-derived defaults.
  const overrides: Partial<ProviderContext> = {};
  if (values.key) overrides.hostedKey = values.key;
  if (values["api-url"]) overrides.hostedBaseUrl = values["api-url"];
  if (values.access) overrides.modePref = values.access as ModePref;
  const ctx = defaultContext(overrides);

  const providerNames = values.providers?.split(",").map((s) => s.trim());
  const results = values.results ? Number(values.results) : undefined;

  if (cmd === "providers") {
    const list = ALL_PROVIDERS.map((p) => providerStatus(p, ctx));
    if (values.json) {
      console.log(JSON.stringify(list, null, 2));
      return;
    }
    for (const p of list) {
      console.log(`${p.available ? "●" : "○"} ${p.name.padEnd(16)} [${p.modes.join(", ")}]  ${p.source}`);
    }
    return;
  }

  if (cmd === "search") {
    const [from, to] = rest;
    if (!from || !to) throw new Error("search needs <from> <to>");
    const journeys = await search(
      {
        from,
        to,
        date: values.date,
        time: values.time,
        arriveBy: values["arrive-by"],
        results,
        includeRaw: values.raw,
      },
      ctx,
      { mode: values.mode as Mode | undefined, providers: providerNames },
    );
    console.log(values.json ? JSON.stringify(journeys, null, 2) : journeysTable(journeys));
    return;
  }

  if (cmd === "plan") {
    const [path] = rest;
    if (!path) throw new Error("plan needs <itinerary file>");
    const itin = await loadItinerary(path);
    if (results) itin.defaults = { ...itin.defaults, results };
    const planned = await planItinerary(itin, ctx, Boolean(values.raw));
    if (values.json) {
      console.log(JSON.stringify(planned, null, 2));
      return;
    }
    const md = planMarkdown(planned, new Date().toISOString().slice(0, 10));
    if (values.out) {
      await Bun.write(values.out, md);
      console.error(`Wrote ${values.out}`);
    } else {
      console.log(md);
    }
    return;
  }

  console.error(`Unknown command: ${cmd}\n`);
  console.log(HELP);
  process.exit(1);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
