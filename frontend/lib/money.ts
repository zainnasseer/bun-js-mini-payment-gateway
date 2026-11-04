import type { FilteredVolumeUsd } from "../../src/types";

/** Amount is stored in smallest currency units (e.g. fils for AED, cents for USD). */
export function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function formatFilteredVolumeUsd(volume: FilteredVolumeUsd | null): string {
  if (!volume) return formatMoney(0, "USD");
  return formatMoney(volume.amountUsdMinor, volume.currency);
}

/** Short label for the FX source tag on the volume stat card. */
export function formatFxRateSourceTag(rateSource: string): string {
  if (rateSource.startsWith("live:")) {
    const host = rateSource.slice(5);
    if (host.includes("er-api.com")) return "ExchangeRate-API";
    return host;
  }
  if (rateSource === "fallback:static") return "Static fallback";
  if (rateSource.startsWith("env:")) return "Env rates";
  return rateSource;
}
