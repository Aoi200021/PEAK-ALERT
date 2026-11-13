import { describe, expect, it } from "vitest";
import { positionPnl } from "./portfolio";
import { advancePaperExit, exitEdgePct } from "./paper-exit";
import { formatPrice } from "./format";

describe("positionPnl", () => {
  it("computes open P&L from current price", () => {
    const r = positionPnl({ entry_price: "0.001", invested_usd: 100, exit_price: null }, 0.003);
    expect(r.quantity).toBeCloseTo(100_000);
    expect(r.value).toBeCloseTo(300);
    expect(r.pnl).toBeCloseTo(200);
    expect(r.pnlPct).toBeCloseTo(200);
    expect(r.closed).toBe(false);
  });
  it("uses the exit price when closed", () => {
    const r = positionPnl({ entry_price: 2, invested_usd: 50, exit_price: 1 }, 10);
    expect(r.pnl).toBeCloseTo(-25);
    expect(r.closed).toBe(true);
  });
  it("returns nulls instead of guessing when price is unknown", () => {
    const r = positionPnl({ entry_price: 2, invested_usd: 50, exit_price: null }, null);
    expect(r.pnl).toBeNull();
  });
});

describe("paper exit", () => {
  it("records checkpoints once and tracks extremes", () => {
    const created = new Date("2026-01-01T00:00:00Z");
    let pe = { created_at: created.toISOString(), alert_price: 1, checkpoints: {}, max_price_after: null as number | null, min_price_after: null as number | null };
    const step = (mins: number, price: number) => {
      const patch = advancePaperExit(pe, price, new Date(created.getTime() + mins * 60_000));
      pe = { ...pe, ...patch };
      return patch;
    };
    step(30, 1.2);
    step(61, 0.8);
    const p = step(120, 0.5);
    expect(p.checkpoints["1h"]).toEqual({ price: 0.8, at: expect.any(String) });
    expect(p.checkpoints["24h"]).toBeUndefined();
    expect(p.max_price_after).toBe(1.2);
    expect(p.min_price_after).toBe(0.5);
    expect(p.closed).toBe(false);
    expect(step(7 * 24 * 60, 0.4).closed).toBe(true);
  });
  it("exit edge: selling at 1 vs holding to 0.5 avoided a 50% drop (= +100% more value)", () => {
    expect(exitEdgePct(1, 0.5)).toBeCloseTo(100);
    expect(exitEdgePct(1, 2)).toBeCloseTo(-50);
  });
});

describe("formatPrice", () => {
  it("uses subscript zeros for tiny prices", () => {
    expect(formatPrice(0.000002675)).toBe("$0.0₅2675");
    expect(formatPrice(0.0123)).toBe("$0.0123");
    expect(formatPrice(1234.5)).toBe("$1,234.5");
    expect(formatPrice(null)).toBe("—");
  });
});
