import { describe, expect, it } from "vitest";
import { avgPriceLastHour, liquidityChangePct } from "./context";

const NOW = Date.parse("2026-01-01T12:00:00Z");
const pts = (mins: number) => Array.from({ length: mins }, (_, i) => ({ t: NOW - (mins - i) * 60_000, price: 1 + i * 0.01, liquidity: 100_000 + i * 100, marketCap: null }));

describe("history context", () => {
  it("compares liquidity to ~1h ago", () => {
    const s = pts(90); // liquidity 1h ago ≈ 100_000 + 30*100 = 103_000
    expect(liquidityChangePct(s, 82_400, 3600_000, NOW)).toBeCloseTo(-20, 0);
  });
  it("returns null when history is too short", () => {
    expect(liquidityChangePct(pts(30), 50_000, 3600_000, NOW)).toBeNull();
    expect(avgPriceLastHour(pts(10), NOW)).toBeNull();
  });
  it("averages last-hour prices", () => {
    expect(avgPriceLastHour(pts(120), NOW)).toBeCloseTo(1 + 89.5 * 0.01, 2);
  });
});
