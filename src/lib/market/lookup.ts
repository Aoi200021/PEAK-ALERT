import "server-only";
import { SOLANA_ADDRESS } from "../validation";
import { lookupToken, type LookupResult, type TokenCandidate } from "./dexscreener";
import { fetchJupiterTokens, jupiterToCandidate } from "./jupiter";

export interface FindResult {
  candidates: TokenCandidate[];
  reason: LookupResult["reason"] | "no_trades";
  resolvedFromPair?: string;
  source: "dexscreener" | "jupiter" | null;
  /** When the token exists on a launchpad but has no trades yet. */
  info?: { name: string | null; symbol: string | null; launchpad: string | null; holders: number | null };
}

/**
 * Find a token by CA / pair address / link-extracted address.
 * DexScreener first (all chains); for Solana, Jupiter as fallback — it covers
 * Pump.fun tokens still on the bonding curve that DexScreener hasn't indexed.
 */
export async function findToken(address: string): Promise<FindResult> {
  const dex = await lookupToken(address);
  if (dex.candidates.length) return { ...dex, source: "dexscreener" };

  if (SOLANA_ADDRESS.test(address)) {
    const jup = (await fetchJupiterTokens([address])).get(address);
    if (jup) {
      const c = jupiterToCandidate(jup);
      if (c) return { candidates: [c], reason: "ok", source: "jupiter" };
      return {
        candidates: [],
        reason: "no_trades",
        source: null,
        info: { name: jup.name ?? null, symbol: jup.symbol ?? null, launchpad: jup.launchpad ?? null, holders: jup.holderCount ?? null },
      };
    }
  }
  return { ...dex, source: null };
}
