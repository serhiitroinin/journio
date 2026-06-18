// Tiny fetch wrapper used as the default ProviderContext.fetchJson.
// Providers receive this via context so tests can swap in a mock.

export interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchJson(url: string, init: FetchJsonOptions = {}): Promise<any> {
  const { timeoutMs = 20_000, ...rest } = init;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctl.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}${body ? ` — ${body.slice(0, 200)}` : ""}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}
