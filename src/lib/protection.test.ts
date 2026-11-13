import { describe, expect, it } from "vitest";
import { protectionSummary, simulateTrailingStops } from "./protection";

describe("simulateTrailingStops", () => {
  const path = [1, 1.5, 2, 3, 2.8, 2.5, 2.2, 1.6, 1.2].map((price, i) => ({ t: i, price }));
  it("exits at the first observed price below each trailing level", () => {
    const [s10, s20, s50] = simulateTrailingStops(path, 1, 100, [10, 20, 50]);
    expect(s10).toMatchObject({ triggered: true, exitPrice: 2.5 }); // 3 → 2.7 level, first ≤ is 2.5
    expect(s10.pnlUsd).toBeCloseTo(150);
    expect(s20).toMatchObject({ triggered: true, exitPrice: 2.2 });
    expect(s50).toMatchObject({ triggered: true, exitPrice: 1.2 });
  });
  it("reports not triggered when the stop was never hit", () => {
    const [s] = simulateTrailingStops([{ t: 0, price: 1.1 }, { t: 1, price: 1.3 }], 1, 100, [20]);
    expect(s.triggered).toBe(false);
    expect(s.valueUsd).toBeNull();
  });
});

describe("protectionSummary", () => {
  it("computes ROI, max profit and giveback", () => {
    const r = protectionSummary(1, 100, 3, 2);
    expect(r.roiPct).toBeCloseTo(100);
    expect(r.maxProfitUsd).toBeCloseTo(200);
    expect(r.drawdownFromPeakPct).toBeCloseTo(-33.33, 1);
    expect(r.givebackPct).toBeCloseTo(50);
  });
});
