import { test, expect, afterEach } from "bun:test";
import { __resetFxRatesForTests, refreshFxRates, usdPerMajorFromUsdBaseTable } from "./fxLive";

afterEach(() => {
  __resetFxRatesForTests();
});

test("refreshFxRates parses open.er-api.com USD-base payload", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        result: "success",
        base_code: "USD",
        time_last_update_utc: "Wed, 04 Nov 2026 00:02:31 +0000",
        conversion_rates: { USD: 1, EUR: 0.5, GBP: 0.8, JPY: 100, AED: 3.67, SAR: 3.75 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;

  try {
    const snap = await refreshFxRates(true);
    expect(snap.source).toBe("live:open.er-api.com");
    expect(snap.ratesAsOf).toBe("2026-11-04");
    expect(snap.usdPerMajorUnit.EUR).toBe(2);
    expect(snap.usdPerMajorUnit.JPY).toBe(0.01);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("usdPerMajorFromUsdBaseTable keeps fallback for missing codes", () => {
  const rates = usdPerMajorFromUsdBaseTable({ USD: 1, EUR: 0.92 });
  expect(rates.EUR).toBeCloseTo(1 / 0.92, 8);
  expect(rates.GBP).toBeGreaterThan(0);
});
