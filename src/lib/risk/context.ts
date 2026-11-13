import type { SeriesPoint } from "./score";

/** % change of liquidity vs. the snapshot closest to `agoMs` ago (needs history covering ≥ 80% of the window). */
export function liquidityChangePct(series: SeriesPoint[], liqNow: number | null, agoMs: number, now: number): number | null {
  if (liqNow == null || series.length < 3) return null;
  const target = now - agoMs;
  const first = series[0].t;
  if (now - first < agoMs * 0.8) return null;
  let best: SeriesPoint | null = null;
  for (const p of series) {
    if (p.liquidity == null) continue;
    if (!best || Math.abs(p.t - target) < Math.abs(best.t - target)) best = p;
  }
  if (!best || !best.liquidity) return null;
  return (liqNow / best.liquidity - 1) * 100;
}

/** Average price over the last 60 min (needs ≥ 20 points spanning ≥ 45 min). */
export function avgPriceLastHour(series: SeriesPoint[], now: number): number | null {
  const pts = series.filter((p) => p.t >= now - 3600_000);
  if (pts.length < 20 || pts[pts.length - 1].t - pts[0].t < 45 * 60_000) return null;
  return pts.reduce((s, p) => s + p.price, 0) / pts.length;
}

export function parseSeriesRow(row: { ts: string[]; prices: (string | number)[]; liquidity: (string | number | null)[]; market_caps: (string | number | null)[] }): SeriesPoint[] {
  return row.ts.map((t, i) => ({
    t: Date.parse(t),
    price: Number(row.prices[i]),
    liquidity: row.liquidity[i] == null ? null : Number(row.liquidity[i]),
    marketCap: row.market_caps[i] == null ? null : Number(row.market_caps[i]),
  }));
}
