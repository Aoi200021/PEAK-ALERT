/**
 * Hits the real DexScreener API. Skipped unless LIVE=1:
 *   LIVE=1 npx vitest run src/lib/market/dexscreener.live.test.ts
 */
import { describe, expect, it } from "vitest";
import { fetchPairsForChain, lookupToken, pairToTokenRow } from "./dexscreener";

const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";

describe.skipIf(!process.env.LIVE)("DexScreener (live)", () => {
  it("resolves a PAIR address (what DexScreener URLs contain) to its token", async () => {
    const r = await lookupToken("5zpyutJu9ee6jFymDGoK7F6S5Kczqtc9FomP3ueKuyA9"); // BONK/SOL pool on Orca
    expect(r.resolvedFromPair).toBeTruthy();
    expect(r.candidates[0].address).toBe(BONK);
  });

  it("looks up a Solana token", async () => {
    const { candidates: c } = await lookupToken(BONK);
    expect(c[0].chainId).toBe("solana");
    expect(c[0].symbol?.toLowerCase()).toBe("bonk");
    expect(c[0].priceUsd).toBeGreaterThan(0);
  });

  it("returns several chains for an EVM address, most liquid first", async () => {
    const { candidates: c } = await lookupToken(PEPE);
    expect(c[0].chainId).toBe("ethereum");
    expect(c[0].address).toBe(PEPE);
  });

  it("batch-fetches by chain and maps to DB columns", async () => {
    const m = await fetchPairsForChain("solana", [BONK, "So11111111111111111111111111111111111111112"]);
    const row = pairToTokenRow(m.get(BONK)!);
    expect(row.price_usd).toBeGreaterThan(0);
    expect(row.volume_h24).not.toBeNull();
    expect(typeof row.txns).toBe("object");
  });

  it("returns nothing (not fake data) for an unknown address", async () => {
    expect(await lookupToken("0x000000000000000000000000000000000000dEaD")).toMatchObject({ candidates: [], reason: "no_pairs" });
    const m = await fetchPairsForChain("ethereum", ["0x000000000000000000000000000000000000dead"]);
    expect(m.size).toBe(0);
  });
});

describe.skipIf(!process.env.LIVE)("Solana fallback (live)", () => {
  it("explains tokens that exist on Pump.fun but have no trades", async () => {
    const { findToken } = await import("./lookup");
    const r = await findToken("HNEPZXGMLqGu9Pi79sqzVdexPZhhH6FwToUjLJcEpump");
    expect(r.candidates).toEqual([]);
    expect(r.reason).toBe("no_trades");
    expect(r.info?.launchpad).toBe("pump.fun");
  });

  it("finds traded Pump.fun tokens DexScreener hasn't indexed, via Jupiter", async () => {
    const { findToken } = await import("./lookup");
    const res = await fetch("https://lite-api.jup.ag/tokens/v2/recent");
    const recent = ((await res.json()) as { id: string; launchpad?: string; usdPrice?: number }[]).filter(
      (t) => t.launchpad === "pump.fun" && t.usdPrice,
    );
    const ids = recent.map((t) => t.id).slice(0, 25);
    const dex = await fetchPairsForChain("solana", ids);
    const missing = ids.find((id) => !dex.has(id));
    if (!missing) return; // DexScreener happened to have them all right now
    const r = await findToken(missing);
    expect(r.source).toBe("jupiter");
    expect(r.candidates[0].priceUsd).toBeGreaterThan(0);
  });
});
