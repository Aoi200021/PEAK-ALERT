import "server-only";
import { computeMomentum, computeRisk } from "../risk/score";
import { SUPPORTED_CHAINS, normalizeAddress } from "../validation";
import { fetchPairsForChain, pairToTokenRow, pickBestPair, searchPairs, type DexPair } from "./dexscreener";

/** Well-known Solana memecoins used for the public preview (addresses verified on DexScreener). */
export const DEMO_TOKENS = [
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // BONK
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", // POPCAT
];
export const WSOL = "So11111111111111111111111111111111111111112";

const TTL = 30_000;
let cache: { at: number; data: PublicSnapshot } | null = null;

export interface PublicToken {
  address: string;
  chain_id: string;
  symbol: string | null;
  name: string | null;
  image_url: string | null;
  pair_url: string | null;
  price_usd: number | null;
  market_cap: number | null;
  liquidity_usd: number | null;
  volume_h24: number | null;
  change_h1: number | null;
  change_h24: number | null;
  risk_score: number;
  risk_level: string;
  risk_coverage: number;
  momentum_score: number | null;
  risk_factors: ReturnType<typeof computeRisk>["factors"];
}

export interface PublicSnapshot {
  /** true = static demonstration values, NOT market data. */
  demo: boolean;
  fetchedAt: string;
  sol: { price_usd: number | null; change_h24: number | null } | null;
  tokens: PublicToken[];
}

function toPublic(address: string, p: DexPair, chainId = "solana"): PublicToken {
  const row = pairToTokenRow(p);
  const market = {
    priceUsd: row.price_usd,
    marketCap: row.market_cap,
    liquidityUsd: row.liquidity_usd,
    volume: { m5: row.volume_m5, h1: row.volume_h1, h6: row.volume_h6, h24: row.volume_h24 },
    change: { m5: row.change_m5, h1: row.change_h1, h6: row.change_h6, h24: row.change_h24 },
    txnsM5: p.txns?.m5 ?? null,
    txnsH1: p.txns?.h1 ?? null,
  };
  // No PeakAlert history here → history-based factors are excluded (coverage < 1).
  const risk = computeRisk(market, []);
  return {
    address,
    chain_id: chainId,
    symbol: row.symbol,
    name: row.name,
    image_url: row.image_url,
    pair_url: row.pair_url,
    price_usd: row.price_usd,
    market_cap: row.market_cap,
    liquidity_usd: row.liquidity_usd,
    volume_h24: row.volume_h24,
    change_h1: row.change_h1,
    change_h24: row.change_h24,
    risk_score: risk.score,
    risk_level: risk.level,
    risk_coverage: risk.coverage,
    momentum_score: computeMomentum(market),
    risk_factors: risk.factors,
  };
}

/** Live public snapshot from DexScreener (cached 30 s). Falls back to clearly-labelled demo data. */
export async function getPublicSnapshot(): Promise<PublicSnapshot> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  try {
    const pairs = await fetchPairsForChain("solana", [...DEMO_TOKENS, WSOL]);
    const tokens = DEMO_TOKENS.filter((a) => pairs.has(a)).map((a) => toPublic(a, pairs.get(a)!));
    if (!tokens.length) throw new Error("no data");
    const sol = pairs.get(WSOL);
    const data: PublicSnapshot = {
      demo: false,
      fetchedAt: new Date().toISOString(),
      sol: sol ? { price_usd: sol.priceUsd, change_h24: sol.priceChange?.h24 ?? null } : null,
      tokens,
    };
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return demoSnapshot();
  }
}

/** Static values for when no market API is reachable. Always shown with a DEMO banner. */
export function demoSnapshot(): PublicSnapshot {
  const mk = (symbol: string, price: number, mc: number, h1: number, h24: number, risk: number, momentum: number): PublicToken => ({
    address: `demo-${symbol}`,
    chain_id: "solana",
    symbol,
    name: `${symbol} (demo)`,
    image_url: null,
    pair_url: null,
    price_usd: price,
    market_cap: mc,
    liquidity_usd: mc * 0.04,
    volume_h24: mc * 0.3,
    change_h1: h1,
    change_h24: h24,
    risk_score: risk,
    risk_level: risk <= 30 ? "healthy" : risk <= 60 ? "caution" : risk <= 80 ? "elevated" : "very_high",
    risk_coverage: 0.5,
    momentum_score: momentum,
    risk_factors: [],
  });
  return {
    demo: true,
    fetchedAt: new Date().toISOString(),
    sol: null,
    tokens: [mk("DEMOA", 0.00042, 4_200_000, 6.5, 85, 22, 81), mk("DEMOB", 0.0183, 18_300_000, -7.2, 140, 74, 28), mk("DEMOC", 0.0009, 900_000, -1.1, -12, 47, 39)],
  };
}

const lookupCache = new Map<string, { at: number; data: PublicToken[] }>();

/** Analyze any address for the public demo: one result per supported chain, most liquid first. */
export async function analyzePublicAddress(address: string): Promise<PublicToken[]> {
  const key = address.trim();
  const hit = lookupCache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  const pairs = await searchPairs(key);
  const chains = [...new Set(pairs.map((p) => p.chainId))].filter((c) => (SUPPORTED_CHAINS as readonly string[]).includes(c));
  const out: PublicToken[] = [];
  for (const chainId of chains) {
    const best = pickBestPair(pairs, chainId, key);
    if (best) out.push(toPublic(normalizeAddress(chainId, best.baseToken.address), best, chainId));
  }
  out.sort((a, b) => (b.liquidity_usd ?? 0) - (a.liquidity_usd ?? 0));
  if (lookupCache.size > 500) lookupCache.clear();
  lookupCache.set(key, { at: Date.now(), data: out });
  return out;
}
