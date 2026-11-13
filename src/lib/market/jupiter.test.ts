import { describe, expect, it } from "vitest";
import { jupiterToCandidate, jupiterToRow, type JupToken } from "./jupiter";

const base: JupToken = {
  id: "8RKxNY4TJbwsaf4iepmJMQXf5Y9jgt4TSY9zs8sLpump",
  name: "Elizabeth",
  symbol: "ELIZABETH",
  icon: "https://example.com/i.png",
  usdPrice: 0.0000019,
  mcap: 1917,
  fdv: 3834,
  liquidity: 1887,
  holderCount: 3,
  launchpad: "pump.fun",
  stats5m: { priceChange: -21.8, buyVolume: 300, sellVolume: 90, numBuys: 2, numSells: 1 },
  stats1h: { priceChange: -21.8, buyVolume: 300, sellVolume: 90, numBuys: 2, numSells: 1 },
  stats6h: null,
  stats24h: { priceChange: 5, buyVolume: 1000, sellVolume: 500, numBuys: 10, numSells: 7 },
};

describe("Jupiter fallback mapping", () => {
  it("maps Jupiter stats to the same columns as DexScreener", () => {
    const r = jupiterToRow(base)!;
    expect(r.price_usd).toBe(0.0000019);
    expect(r.market_cap).toBe(1917);
    expect(r.volume_h1).toBe(390);
    expect(r.volume_h24).toBe(1500);
    expect(r.volume_h6).toBeNull(); // missing → null, never estimated
    expect(r.change_m5).toBe(-21.8);
    expect(r.txns).toMatchObject({ h1: { buys: 2, sells: 1 }, h6: null });
    expect(r.pair_url).toBe(`https://pump.fun/coin/${base.id}`);
    expect(r.dex_id).toBe("pump.fun");
  });

  it("refuses tokens without a real USD price (no trades)", () => {
    expect(jupiterToRow({ ...base, usdPrice: null })).toBeNull();
    expect(jupiterToCandidate({ ...base, usdPrice: undefined })).toBeNull();
  });
});
