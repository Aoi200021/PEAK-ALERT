import "server-only";
import { z } from "zod";
import type { MarketRow } from "./dexscreener";

/**
 * Birdeye — OPTIONAL secondary source for Solana tokens (needs BIRDEYE_API_KEY).
 * Used only as a fallback when DexScreener has no data or fails for a Solana token.
 * Docs: https://docs.birdeye.so/reference/get-defi-token_overview
 *
 * NOTE: not verified against the live API from this repo's CI (no key available);
 * parsing is tolerant and missing fields stay null.
 */
const BASE = "https://public-api.birdeye.so";

export function birdeyeEnabled() {
  return Boolean(process.env.BIRDEYE_API_KEY);
}

const n = z.union([z.number(), z.string()]).nullish().transform((v) => {
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
});

const overviewSchema = z.object({
  success: z.boolean().optional(),
  data: z
    .object({
      address: z.string().nullish(),
      name: z.string().nullish(),
      symbol: z.string().nullish(),
      logoURI: z.string().nullish(),
      price: n,
      marketCap: n,
      mc: n,
      fdv: n,
      liquidity: n,
      v1hUSD: n,
      v24hUSD: n,
      priceChange1hPercent: n,
      priceChange24hPercent: n,
      buy1h: n,
      sell1h: n,
    })
    .passthrough()
    .nullish(),
});

/** Same column shape as pairToTokenRow(). Fields Birdeye doesn't give are null (never estimated). */
export async function fetchBirdeyeRow(address: string): Promise<MarketRow | null> {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${BASE}/defi/token_overview?address=${encodeURIComponent(address)}`, {
      headers: { "X-API-KEY": key, "x-chain": "solana", accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const parsed = overviewSchema.safeParse(await res.json());
    const d = parsed.success ? parsed.data.data : null;
    if (!d || d.price == null) return null;
    const buys = d.buy1h;
    const sells = d.sell1h;
    return {
      pair_address: null,
      dex_id: null,
      pair_url: `https://birdeye.so/token/${address}?chain=solana`,
      name: d.name ?? null,
      symbol: d.symbol ?? null,
      image_url: d.logoURI ?? null,
      price_usd: d.price,
      price_native: null,
      market_cap: d.marketCap ?? d.mc ?? null,
      fdv: d.fdv ?? null,
      liquidity_usd: d.liquidity ?? null,
      volume_m5: null,
      volume_h1: d.v1hUSD ?? null,
      volume_h6: null,
      volume_h24: d.v24hUSD ?? null,
      change_m5: null,
      change_h1: d.priceChange1hPercent ?? null,
      change_h6: null,
      change_h24: d.priceChange24hPercent ?? null,
      txns: buys != null && sells != null ? { h1: { buys, sells } } : null,
      pair_created_at: null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
