import { test, expect, beforeEach } from "bun:test";
import {
  convertMinorToUsdMinorWithRates,
  sumAmountsAsUsdMinor,
  sumAmountsByCurrency,
} from "./fx";
import {
  __resetFxRatesForTests,
  __setFxRateSnapshotForTests,
  FX_FALLBACK_USD_PER_MAJOR_UNIT,
  usdPerMajorFromUsdBaseTable,
} from "./fxLive";

const TEST_RATES = { ...FX_FALLBACK_USD_PER_MAJOR_UNIT, EUR: 1.08 };

beforeEach(() => {
  __resetFxRatesForTests();
  __setFxRateSnapshotForTests({
    usdPerMajorUnit: TEST_RATES,
    ratesAsOf: "2026-11-04",
    source: "test",
    fetchedAt: new Date().toISOString(),
  });
});

test("convertMinorToUsdMinorWithRates — USD is identity", () => {
  expect(convertMinorToUsdMinorWithRates(1999, "USD", TEST_RATES)).toBe(1999);
});

test("convertMinorToUsdMinorWithRates — EUR uses configured rate", () => {
  expect(convertMinorToUsdMinorWithRates(100, "EUR", TEST_RATES)).toBe(108);
});

test("convertMinorToUsdMinorWithRates — JPY has zero decimal minor units", () => {
  expect(convertMinorToUsdMinorWithRates(1000, "JPY", TEST_RATES)).toBe(670);
});

test("sumAmountsAsUsdMinor — mixed currencies", () => {
  const total = sumAmountsAsUsdMinor(
    [
      { amount: 100, currency: "USD" },
      { amount: 100, currency: "EUR" },
    ],
    TEST_RATES
  );
  expect(total).toBe(208);
});

test("usdPerMajorFromUsdBaseTable inverts USD-base quotes", () => {
  const rates = usdPerMajorFromUsdBaseTable({ USD: 1, EUR: 0.5, JPY: 100 });
  expect(rates.USD).toBe(1);
  expect(rates.EUR).toBe(2);
  expect(rates.JPY).toBe(0.01);
});

test("sumAmountsByCurrency aggregates per currency", () => {
  const rows = [
    { amount: 100, currency: "USD" },
    { amount: 200, currency: "USD" },
    { amount: 50, currency: "EUR" },
  ];
  const breakdown = sumAmountsByCurrency(rows);
  expect(breakdown).toHaveLength(2);
  expect(breakdown.find((b) => b.currency === "USD")).toEqual({
    currency: "USD",
    amountMinor: 300,
    transactionCount: 2,
  });
  expect(breakdown.find((b) => b.currency === "EUR")).toEqual({
    currency: "EUR",
    amountMinor: 50,
    transactionCount: 1,
  });
});
