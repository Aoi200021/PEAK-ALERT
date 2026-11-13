/**
 * Profit Protection — pure helpers.
 * All numbers are estimates from the user's own entry data and prices PeakAlert observed.
 */

export interface PricePoint {
  t: number;
  price: number;
}

export interface StopSimulation {
  trailPct: number;
  triggered: boolean;
  exitPrice: number | null;
  exitAt: number | null;
  /** Value kept by selling at the stop (USD), or null if not triggered. */
  valueUsd: number | null;
  pnlUsd: number | null;
  roiPct: number | null;
}

/**
 * Simulates trailing stops over the observed price path since entry.
 * The exit is the first OBSERVED price at or below the stop level (not the level itself),
 * which is conservative: real fills depend on liquidity and slippage.
 */
export function simulateTrailingStops(
  path: PricePoint[],
  entryPrice: number,
  invested: number,
  levels: number[] = [10, 20, 30, 40, 50],
): StopSimulation[] {
  const qty = invested / entryPrice;
  return levels.map((trailPct) => {
    let peak = entryPrice;
    for (const p of path) {
      if (p.price > peak) peak = p.price;
      if (p.price <= peak * (1 - trailPct / 100)) {
        const value = qty * p.price;
        return {
          trailPct,
          triggered: true,
          exitPrice: p.price,
          exitAt: p.t,
          valueUsd: value,
          pnlUsd: value - invested,
          roiPct: (p.price / entryPrice - 1) * 100,
        };
      }
    }
    return { trailPct, triggered: false, exitPrice: null, exitAt: null, valueUsd: null, pnlUsd: null, roiPct: null };
  });
}

export interface ProtectionSummary {
  quantity: number;
  currentValue: number | null;
  pnlUsd: number | null;
  roiPct: number | null;
  peakPrice: number;
  maxValue: number;
  maxProfitUsd: number;
  maxRoiPct: number;
  drawdownFromPeakPct: number | null;
  /** Share of the max unrealized profit already given back (0–100), null if never in profit. */
  givebackPct: number | null;
}

export function protectionSummary(entryPrice: number, invested: number, peakPrice: number, price: number | null): ProtectionSummary {
  const quantity = invested / entryPrice;
  const peak = Math.max(peakPrice, entryPrice, price ?? 0);
  const maxValue = quantity * peak;
  const maxProfitUsd = maxValue - invested;
  const currentValue = price != null ? quantity * price : null;
  const pnlUsd = currentValue != null ? currentValue - invested : null;
  return {
    quantity,
    currentValue,
    pnlUsd,
    roiPct: price != null ? (price / entryPrice - 1) * 100 : null,
    peakPrice: peak,
    maxValue,
    maxProfitUsd,
    maxRoiPct: (peak / entryPrice - 1) * 100,
    drawdownFromPeakPct: price != null ? ((price - peak) / peak) * 100 : null,
    givebackPct: maxProfitUsd > 0 && pnlUsd != null ? Math.max(0, Math.min(100, ((maxProfitUsd - pnlUsd) / maxProfitUsd) * 100)) : null,
  };
}
