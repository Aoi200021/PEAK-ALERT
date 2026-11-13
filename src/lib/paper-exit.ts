/**
 * Paper Exit: what would have happened if you had sold at the alert price.
 * Pure helpers — shared by the server job and the UI.
 */

export const CHECKPOINTS = [
  { key: "1h", ms: 60 * 60 * 1000, label: "1 h" },
  { key: "24h", ms: 24 * 60 * 60 * 1000, label: "24 h" },
  { key: "7d", ms: 7 * 24 * 60 * 60 * 1000, label: "7 d" },
] as const;

export const TRACKING_WINDOW_MS = CHECKPOINTS[CHECKPOINTS.length - 1].ms;

export type Checkpoints = Partial<Record<(typeof CHECKPOINTS)[number]["key"], { price: number; at: string }>>;

export interface PaperExitRow {
  created_at: string;
  alert_price: number;
  checkpoints: Checkpoints;
  max_price_after: number | null;
  min_price_after: number | null;
}

/** Compute the update after observing `price` at `now`. Checkpoints record the first price seen after each mark. */
export function advancePaperExit(pe: PaperExitRow, price: number, now: Date) {
  const age = now.getTime() - new Date(pe.created_at).getTime();
  const checkpoints: Checkpoints = { ...pe.checkpoints };
  for (const c of CHECKPOINTS) {
    if (age >= c.ms && !checkpoints[c.key]) checkpoints[c.key] = { price, at: now.toISOString() };
  }
  return {
    checkpoints,
    max_price_after: pe.max_price_after == null ? price : Math.max(pe.max_price_after, price),
    min_price_after: pe.min_price_after == null ? price : Math.min(pe.min_price_after, price),
    last_price: price,
    last_checked_at: now.toISOString(),
    closed: age >= TRACKING_WINDOW_MS,
  };
}

/**
 * Positive = selling at the alert was better than holding until `laterPrice`
 * (you avoided that % of loss). Negative = you would have missed that upside.
 */
export function exitEdgePct(alertPrice: number, laterPrice: number | null | undefined): number | null {
  if (laterPrice == null || !(laterPrice > 0) || !(alertPrice > 0)) return null;
  return (alertPrice / laterPrice - 1) * 100;
}

/** Change of the price after the alert, from the holder's perspective. */
export function changeAfterAlertPct(alertPrice: number, laterPrice: number | null | undefined): number | null {
  if (laterPrice == null || !(alertPrice > 0)) return null;
  return (laterPrice / alertPrice - 1) * 100;
}
