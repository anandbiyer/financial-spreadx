/**
 * FX Rate lookup — hardcoded demo rates (USD base).
 * All rates express: 1 unit of foreign currency = N USD.
 */

export const FX_RATES: Record<string, number> = {
  USD: 1.0,
  GBP: 1.2653,
  INR: 0.01203,
  CNY: 0.14062,
  NTD: 0.03182,
  HKD: 0.12796,
  EUR: 1.0821,
  AUD: 0.6512,
  CAD: 0.7389,
  SGD: 0.7435,
  JPY: 0.00668,
};

/**
 * Returns the USD conversion rate for a given currency code.
 * Falls back to 1.0 (USD identity) for unknown currencies.
 */
export function getFxRate(currencyCode: string): number {
  return FX_RATES[currencyCode.toUpperCase()] ?? 1.0;
}

/**
 * Converts a value from the given currency to USD.
 * Returns null if value is null.
 */
export function convertToUsd(
  value: number | null,
  currencyCode: string,
): number | null {
  if (value === null) return null;
  return value * getFxRate(currencyCode);
}
