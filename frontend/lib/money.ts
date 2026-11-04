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

export function formatFilteredVolume(transactions: { amount: number; currency: string }[]): string {
  if (transactions.length === 0) return formatMoney(0, "USD");
  const currencies = new Set(transactions.map((t) => t.currency));
  if (currencies.size > 1) return "Mixed currencies";
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  return formatMoney(total, transactions[0]!.currency);
}
