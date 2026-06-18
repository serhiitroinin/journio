// Date/time helpers. Display uses the local wall-clock embedded in the ISO
// string (providers return local-with-offset), so we slice rather than reparse
// to avoid timezone surprises.

/** "2026-07-09T14:24:00+02:00" -> "14:24". Returns "—" when absent. */
export function fmtTime(iso?: string): string {
  if (!iso) return "—";
  const t = iso.indexOf("T");
  return t >= 0 ? iso.slice(t + 1, t + 6) : iso;
}

/** "2026-07-09T14:24:00+02:00" -> "2026-07-09". */
export function fmtDate(iso?: string): string {
  if (!iso) return "";
  const t = iso.indexOf("T");
  return t >= 0 ? iso.slice(0, t) : iso;
}

/** 247 -> "4h07". */
export function fmtDur(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** Minutes between two ISO instants. */
export function diffMin(fromIso?: string, toIso?: string): number {
  if (!fromIso || !toIso) return NaN;
  const a = Date.parse(fromIso);
  const b = Date.parse(toIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 60_000);
}

/** Parse opentransportdata-style "00d04:07:00" into minutes. */
export function parseDayDuration(s?: string): number {
  if (!s) return NaN;
  const m = s.match(/(\d+)d(\d+):(\d+):(\d+)/);
  if (!m) return NaN;
  const [, d, h, min] = m;
  return Number(d) * 1440 + Number(h) * 60 + Number(min);
}

/** Parse ISO-8601 duration "PT4H7M" / Amadeus / Google "8400s" into minutes. */
export function parseIsoDuration(s?: string): number {
  if (!s) return NaN;
  const secs = s.match(/^(\d+)s$/);
  if (secs) return Math.round(Number(secs[1]) / 60);
  const m = s.match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return NaN;
  return Number(m[1] || 0) * 60 + Number(m[2] || 0);
}

/**
 * Build an ISO local-time string for a date+time. We append the given UTC
 * offset (default +02:00, central-European summer) so providers anchor to the
 * right wall clock. Good enough for planning; not a tz database.
 */
export function toIsoLocal(date?: string, time?: string, offset = "+02:00"): string | undefined {
  if (!date) return undefined;
  const hhmm = time && /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "00:00";
  return `${date}T${hhmm}:00${offset}`;
}
