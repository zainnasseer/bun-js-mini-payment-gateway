import { CURRENCY_CODES } from "../db/schema";
import type { CurrencyCode } from "../types";

/** USD per one major unit of the source currency (e.g. 1 EUR → ~1.08 USD). */
export type UsdPerMajorUnitRates = Record<CurrencyCode, number>;

export type FxRateSnapshot = {
  usdPerMajorUnit: UsdPerMajorUnitRates;
  ratesAsOf: string;
  source: string;
  fetchedAt: string;
};

/** Fallback when the live provider is unreachable (demo-quality, not spot). */
export const FX_FALLBACK_USD_PER_MAJOR_UNIT: UsdPerMajorUnitRates = {
  USD: 1,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 0.0067,
  AED: 0.272294,
  SAR: 0.266667,
};

const DEFAULT_FX_API_URL = "https://open.er-api.com/v6/latest/USD";
const DEFAULT_REFRESH_MS = 60 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 8_000;

type ErApiLatestResponse = {
  result?: string;
  base_code?: string;
  time_last_update_utc?: string;
  conversion_rates?: Record<string, number>;
};

let cache: FxRateSnapshot | null = null;
let refreshPromise: Promise<FxRateSnapshot> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function fxApiUrl(): string {
  return process.env.FX_API_URL?.trim() || DEFAULT_FX_API_URL;
}

function fxRefreshMs(): number {
  const n = Number(process.env.FX_REFRESH_MS ?? DEFAULT_REFRESH_MS);
  return Number.isFinite(n) && n >= 60_000 ? n : DEFAULT_REFRESH_MS;
}

function parseEnvOverrideRates(): UsdPerMajorUnitRates | null {
  const raw = process.env.FX_USD_RATES?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const merged = { ...FX_FALLBACK_USD_PER_MAJOR_UNIT };
    for (const code of CURRENCY_CODES) {
      const v = parsed[code];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) merged[code] = v;
    }
    return merged;
  } catch {
    return null;
  }
}

function envOverrideSnapshot(): FxRateSnapshot | null {
  const rates = parseEnvOverrideRates();
  if (!rates) return null;
  const asOf = process.env.FX_RATES_AS_OF?.trim() || new Date().toISOString().slice(0, 10);
  return {
    usdPerMajorUnit: rates,
    ratesAsOf: asOf,
    source: "env:FX_USD_RATES",
    fetchedAt: new Date().toISOString(),
  };
}

/** API returns units of foreign currency per 1 USD → invert for USD per major unit. */
export function usdPerMajorFromUsdBaseTable(rates: Record<string, number>): UsdPerMajorUnitRates {
  const out = { ...FX_FALLBACK_USD_PER_MAJOR_UNIT };
  for (const code of CURRENCY_CODES) {
    if (code === "USD") {
      out.USD = 1;
      continue;
    }
    const foreignPerUsd = rates[code];
    if (typeof foreignPerUsd !== "number" || !Number.isFinite(foreignPerUsd) || foreignPerUsd <= 0) {
      continue;
    }
    out[code] = 1 / foreignPerUsd;
  }
  return out;
}

function parseRatesAsOfUtc(raw: string | undefined): string {
  if (!raw?.trim()) return new Date().toISOString().slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.trim().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

async function fetchLiveSnapshot(): Promise<FxRateSnapshot> {
  const envSnap = envOverrideSnapshot();
  if (envSnap) return envSnap;

  const controller = new AbortController();
  const timeoutMs = Number(process.env.FX_FETCH_TIMEOUT_MS ?? DEFAULT_FETCH_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(fxApiUrl(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`FX HTTP ${res.status}`);

    const body = (await res.json()) as ErApiLatestResponse;
    if (body.result !== "success" || !body.conversion_rates) {
      throw new Error("FX response missing conversion_rates");
    }
    if (body.base_code && body.base_code !== "USD") {
      throw new Error(`FX base must be USD, got ${body.base_code}`);
    }

    return {
      usdPerMajorUnit: usdPerMajorFromUsdBaseTable(body.conversion_rates),
      ratesAsOf: parseRatesAsOfUtc(body.time_last_update_utc),
      source: "live:open.er-api.com",
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackSnapshot(reason: string): FxRateSnapshot {
  console.warn(`[fx] Using fallback rates (${reason})`);
  return {
    usdPerMajorUnit: { ...FX_FALLBACK_USD_PER_MAJOR_UNIT },
    ratesAsOf: process.env.FX_RATES_AS_OF?.trim() || new Date().toISOString().slice(0, 10),
    source: "fallback:static",
    fetchedAt: new Date().toISOString(),
  };
}

export async function refreshFxRates(force = false): Promise<FxRateSnapshot> {
  const envSnap = envOverrideSnapshot();
  if (envSnap) {
    cache = envSnap;
    return envSnap;
  }

  if (!force && cache && Date.now() - new Date(cache.fetchedAt).getTime() < fxRefreshMs()) {
    return cache;
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const snap = await fetchLiveSnapshot();
      cache = snap;
      return snap;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (cache) {
        console.warn(`[fx] Refresh failed (${message}); serving stale live rates`);
        return cache;
      }
      const snap = fallbackSnapshot(message);
      cache = snap;
      return snap;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function ensureFxRatesReady(): Promise<FxRateSnapshot> {
  if (cache) {
    const age = Date.now() - new Date(cache.fetchedAt).getTime();
    if (age < fxRefreshMs()) return cache;
  }
  return refreshFxRates();
}

export function getFxRateSnapshot(): FxRateSnapshot {
  return cache ?? envOverrideSnapshot() ?? fallbackSnapshot("not initialized");
}

export function startFxRatesRefreshLoop(): void {
  void refreshFxRates(true);
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    void refreshFxRates(true);
  }, fxRefreshMs());
}

/** @internal test helper */
export function __resetFxRatesForTests(): void {
  cache = null;
  refreshPromise = null;
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

/** @internal test helper */
export function __setFxRateSnapshotForTests(snapshot: FxRateSnapshot | null): void {
  cache = snapshot;
}
