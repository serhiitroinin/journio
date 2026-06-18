import { describe, expect, test } from "bun:test";
import type { Provider, ProviderContext } from "../src/types";
import { chooseMode, resolveAccess, providerStatus, DEFAULT_HOSTED_BASE } from "../src/lib/gateway";

const free: Provider = {
  name: "free-co",
  modes: ["rail"],
  upstreamBase: "https://up.example",
  directReady: () => true,
  async search() {
    return [];
  },
};

const keyed: Provider = {
  name: "keyed-co",
  modes: ["flight"],
  upstreamBase: "https://up.keyed",
  needsKey: ["KEYED_TOKEN"],
  directReady: (env) => Boolean(env.KEYED_TOKEN),
  async search() {
    return [];
  },
};

function ctx(over: Partial<ProviderContext> = {}): ProviderContext {
  return { env: {}, fetchJson: async () => ({}), ...over };
}

describe("chooseMode precedence", () => {
  test("auto: free upstream always goes direct (never billed)", () => {
    expect(chooseMode(free, ctx())).toBe("direct");
    expect(chooseMode(free, ctx({ hostedKey: "jk" }))).toBe("direct"); // still direct even with a key
  });

  test("auto: keyed provider goes direct with own key, else hosted, else unavailable", () => {
    expect(chooseMode(keyed, ctx({ env: { KEYED_TOKEN: "t" } }))).toBe("direct");
    expect(chooseMode(keyed, ctx({ hostedKey: "jk" }))).toBe("hosted");
    expect(chooseMode(keyed, ctx())).toBeNull();
  });

  test("forced direct ignores hosted key", () => {
    expect(chooseMode(keyed, ctx({ modePref: "direct", hostedKey: "jk" }))).toBeNull();
    expect(chooseMode(free, ctx({ modePref: "direct" }))).toBe("direct");
  });

  test("forced hosted ignores own keys and routes everything to cloud", () => {
    expect(chooseMode(free, ctx({ modePref: "hosted", hostedKey: "jk" }))).toBe("hosted");
    expect(chooseMode(free, ctx({ modePref: "hosted" }))).toBeNull(); // no key -> unavailable
  });
});

describe("resolveAccess", () => {
  test("direct uses upstream base and no auth headers", () => {
    const a = resolveAccess(free, ctx())!;
    expect(a.mode).toBe("direct");
    expect(a.baseUrl).toBe("https://up.example");
    expect(a.headers).toEqual({});
  });

  test("hosted namespaces the provider and attaches the journio bearer", () => {
    const a = resolveAccess(keyed, ctx({ hostedKey: "jk_demo" }))!;
    expect(a.mode).toBe("hosted");
    expect(a.baseUrl).toBe(`${DEFAULT_HOSTED_BASE}/keyed-co`);
    expect(a.headers).toEqual({ Authorization: "Bearer jk_demo" });
  });

  test("custom gateway base url is honored", () => {
    const a = resolveAccess(keyed, ctx({ hostedKey: "jk", hostedBaseUrl: "http://localhost:8787/v1" }))!;
    expect(a.baseUrl).toBe("http://localhost:8787/v1/keyed-co");
  });

  test("unavailable resolves to null", () => {
    expect(resolveAccess(keyed, ctx())).toBeNull();
  });
});

describe("providerStatus", () => {
  test("describes the chosen source", () => {
    expect(providerStatus(free, ctx()).source).toContain("direct");
    expect(providerStatus(keyed, ctx({ env: { KEYED_TOKEN: "t" } })).source).toContain("your keys");
    expect(providerStatus(keyed, ctx({ hostedKey: "jk" })).source).toContain("journio cloud");
    expect(providerStatus(keyed, ctx()).source).toContain("unavailable");
  });
});
