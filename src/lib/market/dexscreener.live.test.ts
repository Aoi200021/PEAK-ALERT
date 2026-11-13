/**
 * Hits the real DexScreener API. Skipped unless LIVE=1:
 *   LIVE=1 npx vitest run src/lib/market/dexscreener.live.test.ts
 */
import { describe, expect, it } from "vitest";
import { fetchPairsForChain, lookupToken, pairToTokenRow } from "./dexscreener";

const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const PEPE = "0x6982508145454ce325ddbe47a25d4ec3d2311933";

describe.skipIf(!process.env.LIVE)("DexScreener (live)", () => {
  it("looks up a Solana token", async () => {
    const c = await lookupToken(BONK);
    expect(c[0].chainId).toBe("solana");
    expect(c[0].symbol?.toLowerCase()).toBe("bonk");
    expect(c[0].priceUsd).toBeGreaterThan(0);
  });

  it("returns several chains for an EVM address, most liquid first", async () => {
    const c = await lookupToken(PEPE);
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
    expect(await lookupToken("0x000000000000000000000000000000000000dEaD")).toEqual([]);
    const m = await fetchPairsForChain("ethereum", ["0x000000000000000000000000000000000000dead"]);
    expect(m.size).toBe(0);
  });
});
