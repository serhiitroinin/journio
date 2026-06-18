// Output formatters: a compact text table for humans, and a markdown timeline
// for the `plan` command. JSON output is just JSON.stringify of the same data,
// so agents get the full structured model.

import type { Journey } from "./types";
import type { PlannedItinerary, PlannedLeg } from "./planner";
import { fmtTime, fmtDur, fmtDate } from "./lib/time";

function price(j: Journey): string {
  return j.price ? `${j.price.currency} ${j.price.amount}` : "—";
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

export function journeysTable(journeys: Journey[]): string {
  if (journeys.length === 0) return "No results.";
  const rows = journeys.map((j) => [
    j.provider,
    fmtTime(j.departure),
    fmtTime(j.arrival),
    fmtDur(j.durationMin),
    String(j.transfers),
    j.products.join(",") || (j.legs[0]?.line ?? "—"),
    price(j),
  ]);
  const head = ["PROVIDER", "DEP", "ARR", "DUR", "CHG", "VIA", "PRICE"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((c, i) => pad(c, widths[i])).join("  ");
  return [line(head), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)].join("\n");
}

const STATUS_ICON: Record<PlannedLeg["status"], string> = {
  ok: "✓",
  "no-coverage": "⚠",
  manual: "✎",
};

function best(leg: PlannedLeg): string {
  const j = leg.journeys[0];
  if (!j) return leg.status === "manual" ? "manual — book directly" : "no API coverage — check manually";
  return `${fmtTime(j.departure)}→${fmtTime(j.arrival)} (${fmtDur(j.durationMin)}, ${j.transfers} chg, ${j.provider})`;
}

export function planMarkdown(planned: PlannedItinerary, generatedOn: string): string {
  const out: string[] = [];
  out.push(`# ${planned.title}`, "", `_Generated ${generatedOn} by journio. Live transit data; verify before booking._`, "");

  out.push("## Timeline", "", "| Date | Route | Mode | Best option |", "|------|-------|------|-------------|");
  for (const l of planned.legs) {
    const date = l.leg.date ?? "";
    out.push(`| ${date} | ${l.leg.from} → ${l.leg.to} | ${l.leg.mode ?? "—"} | ${STATUS_ICON[l.status]} ${best(l)} |`);
  }
  out.push("");

  out.push("## Options per leg", "");
  for (const l of planned.legs) {
    out.push(`### ${l.leg.date ?? ""} — ${l.leg.from} → ${l.leg.to}`);
    if (l.leg.note) out.push(`> ${l.leg.note}`);
    if (l.status === "manual") {
      out.push("", "_Marked manual — no public API for this leg (e.g. ferry, domestic IT/ES rail). Book on the operator site._", "");
      continue;
    }
    if (l.journeys.length === 0) {
      out.push("", `_No results from: ${l.providersTried.join(", ") || "any provider"}. Check manually._`, "");
      continue;
    }
    out.push("");
    for (const j of l.journeys.slice(0, 5)) {
      const via = j.products.join(", ") || j.legs.map((x) => x.line).filter(Boolean).join(" + ");
      out.push(`- **${fmtTime(j.departure)} → ${fmtTime(j.arrival)}** · ${fmtDur(j.durationMin)} · ${j.transfers} chg · ${via} · ${price(j)} _(${j.provider})_`);
    }
    out.push("");
  }

  const manual = planned.legs.filter((l) => l.status !== "ok");
  if (manual.length) {
    out.push("## Needs manual booking / no coverage", "");
    for (const l of manual) out.push(`- ${l.leg.date ?? ""} ${l.leg.from} → ${l.leg.to}${l.leg.note ? ` — ${l.leg.note}` : ""}`);
    out.push("");
  }
  return out.join("\n");
}
