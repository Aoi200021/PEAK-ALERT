import { describe, expect, it } from "vitest";
import { computeMomentum, computeRisk, countPeakTouches, levelFor, ramp, type RiskMarket, type SeriesPoint } from "./score";

const NOW = Date.parse("2026-01-01T12:00:00Z");

function mkt(over: Partial<RiskMarket> = {}): RiskMarket {
  return {
    priceUsd: 1,
    marketCap: 1_000_000,
    liquidityUsd: 100_000,
    volume: { m5: 1000, h1: 12_000, h6: 72_000, h24: 250_000 },
    change: { m5: 0.5, h1: 2, h6: 12, h24: 20 },
    txnsM5: { buys: 10, sells: 10 },
    txnsH1: { buys: 120, sells: 100 },
    ...over,
  };
}

/** Minute series over `minutes`, using fn(i) for price and liq(i) for liquidity. */
function series(minutes: number, fn: (i: number) => number, liq: (i: number) => number = () => 100_000): SeriesPoint[] {
  return Array.from({ length: minutes }, (_, i) => ({ t: NOW - (minutes - i) * 60_000, price: fn(i), liquidity: liq(i), marketCap: fn(i) * 1e6 }));
}

describe("helpers", () => {
  it("ramp interpolates and clamps", () => {
    expect(ramp(-5, [[0, 0], [10, 100]])).toBe(0);
    expect(ramp(5, [[0, 0], [10, 100]])).toBe(50);
    expect(ramp(50, [[0, 0], [10, 100]])).toBe(100);
  });
  it("levels follow the 0–30/31–60/61–80/81–100 bands", () => {
    expect([0, 30, 31, 60, 61, 80, 81, 100].map(levelFor)).toEqual(["healthy", "healthy", "caution", "caution", "elevated", "elevated", "very_high", "very_high"]);
  });
  it("counts separate touches of the high", () => {
    const up = [1, 1.05, 1.1, 1.15, 1.2];
    const down = [1.12, 1.08, 1.05];
    expect(countPeakTouches([...up, ...down, ...up.slice(2), ...down, 1.19, 1.0, 1.0])).toBe(3);
    expect(countPeakTouches([1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9])).toBe(1);
  });
});

describe("computeRisk", () => {
  it("scores a healthy uptrend low", () => {
    const r = computeRisk(mkt(), series(180, (i) => 0.8 + i * 0.0011), NOW);
    expect(r.score).toBeLessThanOrEqual(30);
    expect(r.level).toBe("healthy");
    expect(r.coverage).toBe(1);
  });

  it("scores an exhausted pump high and explains why", () => {
    // Big run-up, rejected at the high twice, now falling with sells, volume and liquidity drying up
    const s = series(240, (i) => {
      if (i < 120) return 0.3 + i * 0.006; // pump to ~1.0
      const wave = [1.0, 0.92, 0.88, 0.95, 0.99, 0.9, 0.85, 0.97, 0.99, 0.88];
      return wave[Math.floor((i - 120) / 12)] ?? 0.8;
    }, (i) => (i < 200 ? 200_000 : 140_000));
    const r = computeRisk(
      mkt({
        priceUsd: 0.78,
        liquidityUsd: 140_000,
        change: { m5: -6, h1: -12, h6: 140, h24: 300 },
        volume: { m5: 200, h1: 8_000, h6: 150_000, h24: 600_000 },
        txnsM5: { buys: 8, sells: 30 },
        txnsH1: { buys: 90, sells: 210 },
      }),
      s,
      NOW,
    );
    expect(r.score).toBeGreaterThan(70);
    expect(["elevated", "very_high"]).toContain(r.level);
    const f = Object.fromEntries(r.factors.map((x) => [x.key, x]));
    expect(f.peak_rejections.score).toBeGreaterThanOrEqual(65);
    expect(f.liquidity_drop.score).toBeGreaterThan(50);
    expect(f.sell_pressure.score).toBeGreaterThan(70);
    expect(r.summary.es).toMatch(/Señales principales/);
    expect(r.summary.en).toMatch(/Main signals/);
    expect(f.sell_pressure.detail.en).toMatch(/More sells than buys/);
    expect(f.sell_pressure.label).toEqual({ en: "Sell pressure", es: "Presión de venta" });
  });

  it("excludes factors without data instead of guessing, and reports coverage", () => {
    const r = computeRisk(mkt({ txnsH1: null, txnsM5: null }), [], NOW);
    const unavailable = r.factors.filter((f) => !f.available).map((f) => f.key).sort();
    expect(unavailable).toEqual(["drawdown", "liquidity_drop", "peak_rejections", "sell_pressure"]);
    expect(r.coverage).toBeCloseTo(0.5, 2);
    for (const f of r.factors.filter((x) => !x.available)) expect(f.score).toBe(0);
  });

  it("returns 0 with no data at all", () => {
    const r = computeRisk(
      { priceUsd: null, marketCap: null, liquidityUsd: null, volume: { m5: null, h1: null, h6: null, h24: null }, change: { m5: null, h1: null, h6: null, h24: null }, txnsM5: null, txnsH1: null },
      [],
      NOW,
    );
    expect(r.score).toBe(0);
    expect(r.coverage).toBe(0);
  });
});

describe("computeMomentum", () => {
  it("ranks a strong buying push above a fading one", () => {
    const strong = computeMomentum(mkt({ change: { m5: 2, h1: 15, h6: 60, h24: 80 }, volume: { m5: 1, h1: 40_000, h6: 100_000, h24: 1 }, txnsH1: { buys: 300, sells: 120 } }))!;
    const weak = computeMomentum(mkt({ change: { m5: -1, h1: -6, h6: 5, h24: 10 }, volume: { m5: 1, h1: 3_000, h6: 60_000, h24: 1 }, txnsH1: { buys: 80, sells: 160 } }))!;
    expect(strong).toBeGreaterThan(75);
    expect(weak).toBeLessThan(35);
  });
});
