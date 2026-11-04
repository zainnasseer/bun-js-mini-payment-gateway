import type { CurrencyCode } from "../types";
import { ensureFxRatesReady, getFxRateSnapshot, type UsdPerMajorUnitRates } from "./fxLive";

/** ISO 4217 minor-unit decimal places (e.g. 2 for USD, 0 for JPY). */
const CURRENCY_MINOR_EXPONENT: Record<CurrencyCode, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  AED: 2,
  SAR: 2,
};

export function convertMinorToUsdMinorWithRates(
  amountMinor: number,
  currency: CurrencyCode,
  usdPerMajorUnit: UsdPerMajorUnitRates
): number {
  if (!Number.isFinite(amountMinor)) return 0;
  const exp = CURRENCY_MINOR_EXPONENT[currency];
  const major = amountMinor / 10 ** exp;
  const usdMajor = major * usdPerMajorUnit[currency];
  return Math.round(usdMajor * 100);
}

export function convertMinorToUsdMinor(amountMinor: number, currency: CurrencyCode): number {
  const { usdPerMajorUnit } = getFxRateSnapshot();
  return convertMinorToUsdMinorWithRates(amountMinor, currency, usdPerMajorUnit);
}

export function sumAmountsAsUsdMinor(
  rows: ReadonlyArray<{ amount: number; currency: string }>,
  usdPerMajorUnit?: UsdPerMajorUnitRates
): number {
  const rates = usdPerMajorUnit ?? getFxRateSnapshot().usdPerMajorUnit;
  let total = 0;
  for (const row of rows) {
    total += convertMinorToUsdMinorWithRates(row.amount, row.currency as CurrencyCode, rates);
  }
  return total;
}

export type CurrencyVolumeBreakdown = {
  currency: CurrencyCode;
  amountMinor: number;
  transactionCount: number;
};

export function sumAmountsByCurrency(
  rows: ReadonlyArray<{ amount: number; currency: string }>
): CurrencyVolumeBreakdown[] {
  const totals = new Map<string, { amountMinor: number; transactionCount: number }>();
  for (const row of rows) {
    const bucket = totals.get(row.currency) ?? { amountMinor: 0, transactionCount: 0 };
    bucket.amountMinor += row.amount;
    bucket.transactionCount += 1;
    totals.set(row.currency, bucket);
  }
  return [...totals.entries()]
    .map(([currency, v]) => ({
      currency: currency as CurrencyCode,
      amountMinor: v.amountMinor,
      transactionCount: v.transactionCount,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor || a.currency.localeCompare(b.currency));
}

export type FilteredVolumeUsd = {
  amountUsdMinor: number;
  currency: "USD";
  ratesAsOf: string;
  rateSource: string;
  byCurrency: CurrencyVolumeBreakdown[];
};

export async function buildFilteredVolumeUsd(
  rows: ReadonlyArray<{ amount: number; currency: string }>
): Promise<FilteredVolumeUsd> {
  const snap = await ensureFxRatesReady();
  return {
    amountUsdMinor: sumAmountsAsUsdMinor(rows, snap.usdPerMajorUnit),
    currency: "USD",
    ratesAsOf: snap.ratesAsOf,
    rateSource: snap.source,
    byCurrency: sumAmountsByCurrency(rows),
  };
}
