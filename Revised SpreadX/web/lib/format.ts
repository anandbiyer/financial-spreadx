/** Shared formatting + confidence-band helpers (cosmetic bands per Q18). */

export function fmtNum(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(v);
}

/** Latest two fiscal-year values from a {year: value} spread, descending by year. */
export function fy12Of(
  spread: Record<string, number | null> | null | undefined
): { fy1: number | null; fy2: number | null } {
  if (!spread) return { fy1: null, fy2: null };
  const ranked = Object.entries(spread)
    .map(([k, v]) => ({ v, y: parseInt((k.match(/(?:19|20)\d{2}/) || ["0"])[0], 10) }))
    .sort((a, b) => b.y - a.y);
  return { fy1: ranked[0]?.v ?? null, fy2: ranked[1]?.v ?? null };
}

export function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toFixed(2)}`;
}

export type Band = "green" | "amber" | "red";

/** Cosmetic confidence band (Q18): ≥0.90 green · 0.75–0.89 amber · <0.75 red. */
export function confBand(c: number): Band {
  if (c >= 0.9) return "green";
  if (c >= 0.75) return "amber";
  return "red";
}

export const BAND_COLOR: Record<Band, string> = {
  green: "var(--conf-green)",
  amber: "var(--conf-amber)",
  red: "var(--conf-red)",
};

export const TEMPLATE_LABEL: Record<string, string> = {
  T0_unknown: "T0 Unknown",
  T1_US_GAAP: "T1 US GAAP",
  T2_US_LP: "T2 US LP/LLC",
  T3_IND_AS: "T3 Ind AS",
  T4_OLD_INDIAN: "T4 Old Indian",
  T5_UK_CO: "T5 UK Co.Act",
  T6_UK_LLP: "T6 UK LLP",
  T7_UK_MORTGAGE: "T7 UK Mortgage",
  T8_IFRS_ASIA: "T8 IFRS Asia",
};

export function templateLabel(t: string): string {
  return TEMPLATE_LABEL[t] ?? t;
}
