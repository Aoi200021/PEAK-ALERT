import "server-only";
import { z } from "zod";
import type { MarketRow, TokenCandidate } from "./dexscreener";

/**
 * Jupiter Tokens API v2 (free, no key) — secondary source for Solana.
 * Covers Pump.fun / launchpad tokens still on their bonding curve that DexScreener
 * hasn't indexed yet. Used ONLY as a fallback when DexScreener has no data.
 * Docs: https://dev.jup.ag/docs/tokens-api  (lite-api = keyless tier, lower rate limits)
 */
const BASE = "https://lite-api.jup.ag/tokens/v2";
const TIMEOUT_MS = 8000;
const MAX_PER_CALL = 50;

const n = z.number().finite().nullish();
const stats = z
  .object({
    priceChange: n,
    buyVolume: n,
    sellVolume: n,
    numBuys: n,
    numSells: n,
  })
  .partial()
  .nullish();

const tokenSchema = z
  .object({
    id: z.string(),
    name: z.string().nullish(),
    symbol: z.string().nullish(),
    icon: z.string().nullish(),
    usdPrice: n,
    mcap: n,
    fdv: n,
    liquidity: n,
    holderCount: n,
    launchpad: z.string().nullish(),
    createdAt: z.string().nullish(),
    stats5m: stats,
    stats1h: stats,
    stats6h: stats,
    stats24h: stats,
  })
  .passthrough();
export type JupToken = z.infer<typeof tokenSchema>;

async function search(mints: string[]): Promise<JupToken[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}/search?query=${mints.map(encodeURIComponent).join(",")}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const raw = await res.json();
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((t) => {
      const p = tokenSchema.safeParse(t);
      return p.success ? [p.data] : [];
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Look up Solana mints on Jupiter (exact id matches only). */
export async function fetchJupiterTokens(mints: string[]): Promise<Map<string, JupToken>> {
  const out = new Map<string, JupToken>();
  for (let i = 0; i < mints.length; i += MAX_PER_CALL) {
    const chunk = mints.slice(i, i + MAX_PER_CALL);
    for (const t of await search(chunk)) if (chunk.includes(t.id)) out.set(t.id, t);
  }
  return out;
}

const vol = (s: JupToken["stats1h"]) =>
  s && (s.buyVolume != null || s.sellVolume != null) ? (s.buyVolume ?? 0) + (s.sellVolume ?? 0) : null;
const tx = (s: JupToken["stats1h"]) => (s && s.numBuys != null && s.numSells != null ? { buys: s.numBuys, sells: s.numSells } : null);

function tokenUrl(t: JupToken) {
  return t.launchpad === "pump.fun" ? `https://pump.fun/coin/${t.id}` : `https://jup.ag/tokens/${t.id}`;
}

/** Same column shape as pairToTokenRow(). Missing fields stay null (never estimated). */
export function jupiterToRow(t: JupToken): MarketRow | null {
  if (t.usdPrice == null || !(t.usdPrice > 0)) return null;
  return {
    pair_address: null,
    dex_id: t.launchpad ?? "jupiter",
    pair_url: tokenUrl(t),
    name: t.name ?? null,
    symbol: t.symbol ?? null,
    image_url: t.icon ?? null,
    price_usd: t.usdPrice,
    price_native: null,
    market_cap: t.mcap ?? null,
    fdv: t.fdv ?? null,
    liquidity_usd: t.liquidity ?? null,
    volume_m5: vol(t.stats5m),
    volume_h1: vol(t.stats1h),
    volume_h6: vol(t.stats6h),
    volume_h24: vol(t.stats24h),
    change_m5: t.stats5m?.priceChange ?? null,
    change_h1: t.stats1h?.priceChange ?? null,
    change_h6: t.stats6h?.priceChange ?? null,
    change_h24: t.stats24h?.priceChange ?? null,
    txns: { m5: tx(t.stats5m), h1: tx(t.stats1h), h6: tx(t.stats6h), h24: tx(t.stats24h) },
    pair_created_at: t.createdAt ?? null,
  };
}

export function jupiterToCandidate(t: JupToken): TokenCandidate | null {
  const row = jupiterToRow(t);
  if (!row) return null;
  return {
    chainId: "solana",
    address: t.id,
    name: row.name,
    symbol: row.symbol,
    priceUsd: row.price_usd,
    marketCap: row.market_cap,
    fdv: row.fdv,
    liquidityUsd: row.liquidity_usd,
    volumeH24: row.volume_h24,
    changeH24: row.change_h24,
    pairAddress: "",
    dexId: row.dex_id,
    url: row.pair_url,
    imageUrl: row.image_url,
    pairCount: 1,
  };
}
