import { toNum } from "./format";

export interface PositionLike {
  entry_price: unknown;
  invested_usd: unknown;
  exit_price: unknown;
}

/**
 * Estimated P&L. Ignores fees, slippage and taxes — it's an estimate based on
 * the entry price the user typed and the latest observed (or exit) price.
 */
export function positionPnl(p: PositionLike, currentPrice: unknown) {
  const entry = toNum(p.entry_price);
  const invested = toNum(p.invested_usd);
  const exit = toNum(p.exit_price);
  const price = exit ?? toNum(currentPrice);
  if (entry == null || invested == null || entry <= 0) {
    return { quantity: null, value: null, pnl: null, pnlPct: null, closed: exit != null };
  }
  const quantity = invested / entry;
  if (price == null) return { quantity, value: null, pnl: null, pnlPct: null, closed: exit != null };
  const value = quantity * price;
  return { quantity, value, pnl: value - invested, pnlPct: (price / entry - 1) * 100, closed: exit != null };
}
