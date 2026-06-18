import { describe, expect, test } from "bun:test";
import type { Journey } from "../src/types";
import { journeysTable, planMarkdown } from "../src/format";
import { fmtDur, parseDayDuration, parseIsoDuration } from "../src/lib/time";

const sample: Journey = {
  provider: "swiss-opendata",
  from: { name: "Tirano" },
  to: { name: "Chur" },
  departure: "2026-07-10T08:24:00+02:00",
  arrival: "2026-07-10T12:31:00+02:00",
  durationMin: 247,
  transfers: 0,
  legs: [{ mode: "rail", line: "PE 973", from: { name: "Tirano" }, to: { name: "Chur" } }],
  products: ["PE"],
  price: null,
};

describe("time helpers", () => {
  test("fmtDur", () => {
    expect(fmtDur(247)).toBe("4h07");
    expect(fmtDur(60)).toBe("1h00");
  });
  test("duration parsers", () => {
    expect(parseDayDuration("00d04:07:00")).toBe(247);
    expect(parseIsoDuration("PT1H20M")).toBe(80);
    expect(parseIsoDuration("5400s")).toBe(90);
  });
});

describe("journeysTable", () => {
  test("renders a header and a row", () => {
    const out = journeysTable([sample]);
    expect(out).toContain("PROVIDER");
    expect(out).toContain("08:24");
    expect(out).toContain("4h07");
    expect(out).toContain("PE");
  });
  test("handles empty", () => {
    expect(journeysTable([])).toBe("No results.");
  });
});

describe("planMarkdown", () => {
  test("renders timeline, options, and manual section", () => {
    const md = planMarkdown(
      {
        title: "Trip",
        legs: [
          { leg: { from: "Tirano", to: "Chur", date: "2026-07-10", mode: "rail" }, status: "ok", providersTried: ["swiss-opendata"], journeys: [sample] },
          { leg: { from: "Napoli", to: "Positano", date: "2026-07-06", mode: "ferry", note: "book ferry" }, status: "manual", providersTried: [], journeys: [] },
        ],
      },
      "2026-06-18",
    );
    expect(md).toContain("# Trip");
    expect(md).toContain("## Timeline");
    expect(md).toContain("Tirano → Chur");
    expect(md).toContain("✓");
    expect(md).toContain("Needs manual booking");
    expect(md).toContain("book ferry");
  });
});
