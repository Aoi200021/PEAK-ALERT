import "server-only";
import { z } from "zod";
import { isEvmChain, normalizeAddress } from "../validation";
import { msg } from "../i18n";

/**
 * DexScreener public API (no API key).
 * Docs: https://docs.dexscreener.com/api/reference
 *
 * Limits we design around:
 *  - /latest/dex/tokens and /tokens/v1: 300 requests/min, max 30 addresses per call.
 *  - Responses are CDN-cached ~30 s (cache-control: max-age=30), so polling faster is useless.
 *  - No historical/OHLC endpoint → PeakAlert stores its own snapshots for peaks & charts.
 *  - marketCap / fdv / liquidity can be missing for some pairs → we keep them null.
 */
const BASE = "https://api.dexscreener.com";
const TIMEOUT_MS = 8000;
export const MAX_ADDRESSES_PER_CALL = 30;

const num = z.union([z.number(), z.string()]).nullish().transform((v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
});

const window4 = z
  .object({ m5: num, h1: num, h6: num, h24: num })
  .partial()
  .nullish();

const txWindow = z.object({ buys: z.number().default(0), sells: z.number().default(0) }).nullish();

export const pairSchema = z.object({
  chainId: z.string(),
  dexId: z.string().nullish(),
  url: z.string().nullish(),
  pairAddress: z.string(),
  baseToken: z.object({ address: z.string(), name: z.string().nullish(), symbol: z.string().nullish() }),
  quoteToken: z.object({ address: z.string().nullish(), symbol: z.string().nullish() }).nullish(),
  priceNative: num,
  priceUsd: num,
  txns: z.object({ m5: txWindow, h1: txWindow, h6: txWindow, h24: txWindow }).partial().nullish(),
  volume: window4,
  priceChange: window4,
  liquidity: z.object({ usd: num }).partial().nullish(),
  fdv: num,
  marketCap: num,
  pairCreatedAt: z.number().nullish(),
  info: z.object({ imageUrl: z.string().nullish() }).partial().nullish(),
});
export type DexPair = z.infer<typeof pairSchema>;

export class MarketApiError extends Error {
  constructor(
    message: string,
    public status: number | null,
    public retryable: boolean,
  ) {
    super(message);
    this.name = "MarketApiError";
  }
}

async function getJson(path: string, attempt = 0): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 250));
        return getJson(path, attempt + 1);
      }
      throw new MarketApiError(msg(`DexScreener returned ${res.status}`, `DexScreener respondió ${res.status}`), res.status, true);
    }
    if (!res.ok) throw new MarketApiError(msg(`DexScreener returned ${res.status}`, `DexScreener respondió ${res.status}`), res.status, false);
    return await res.json();
  } catch (err) {
    if (err instanceof MarketApiError) throw err;
    const aborted = err instanceof Error && err.name === "AbortError";
    if (attempt < 1) return getJson(path, attempt + 1);
    throw new MarketApiError(
      aborted ? msg("DexScreener timed out", "DexScreener no respondió a tiempo") : msg("Could not reach DexScreener", "No se pudo conectar con DexScreener"),
      null,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

function parsePairs(raw: unknown): DexPair[] {
  const arr = Array.isArray(raw) ? raw : (raw as { pairs?: unknown })?.pairs;
  if (!Array.isArray(arr)) return [];
  const out: DexPair[] = [];
  for (const item of arr) {
    const p = pairSchema.safeParse(item);
    if (p.success) out.push(p.data);
  }
  return out;
}

function sameAddress(chainId: string, a: string, b: string) {
  return isEvmChain(chainId) ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** Most liquid pair where the token is the BASE token (so priceUsd is the token's price). */
export function pickBestPair(pairs: DexPair[], chainId: string, address: string): DexPair | null {
  let best: DexPair | null = null;
  for (const p of pairs) {
    if (p.chainId !== chainId || !sameAddress(chainId, p.baseToken.address, address)) continue;
    if (p.priceUsd == null) continue;
    if (!best || (p.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0)) best = p;
  }
  return best;
}

export interface TokenCandidate {
  chainId: string;
  address: string;
  name: string | null;
  symbol: string | null;
  priceUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  liquidityUsd: number | null;
  volumeH24: number | null;
  changeH24: number | null;
  pairAddress: string;
  dexId: string | null;
  url: string | null;
  imageUrl: string | null;
  pairCount: number;
}

/**
 * Search an address across every chain. Returns one candidate per chain (best pair),
 * sorted by liquidity. The same EVM address can exist on several chains.
 */
/** All pairs for an address across chains (raw). */
export async function searchPairs(address: string): Promise<DexPair[]> {
  return parsePairs(await getJson(`/latest/dex/tokens/${encodeURIComponent(address.trim())}`));
}

export async function lookupToken(address: string): Promise<TokenCandidate[]> {
  const pairs = await searchPairs(address);
  const chains = new Set(pairs.map((p) => p.chainId));
  const out: TokenCandidate[] = [];
  for (const chainId of chains) {
    const best = pickBestPair(pairs, chainId, address.trim());
    if (!best) continue;
    out.push({
      chainId,
      address: normalizeAddress(chainId, best.baseToken.address),
      name: best.baseToken.name ?? null,
      symbol: best.baseToken.symbol ?? null,
      priceUsd: best.priceUsd,
      marketCap: best.marketCap,
      fdv: best.fdv,
      liquidityUsd: best.liquidity?.usd ?? null,
      volumeH24: best.volume?.h24 ?? null,
      changeH24: best.priceChange?.h24 ?? null,
      pairAddress: best.pairAddress,
      dexId: best.dexId ?? null,
      url: best.url ?? null,
      imageUrl: best.info?.imageUrl ?? null,
      pairCount: pairs.filter((p) => p.chainId === chainId).length,
    });
  }
  return out.sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
}

/**
 * Fetch current data for up to N addresses on one chain (batched by 30).
 * Returns a map address → best pair. Missing addresses = no data available.
 */
export async function fetchPairsForChain(
  chainId: string,
  addresses: string[],
): Promise<Map<string, DexPair>> {
  const result = new Map<string, DexPair>();
  for (let i = 0; i < addresses.length; i += MAX_ADDRESSES_PER_CALL) {
    const chunk = addresses.slice(i, i + MAX_ADDRESSES_PER_CALL);
    const raw = await getJson(
      `/tokens/v1/${encodeURIComponent(chainId)}/${chunk.map(encodeURIComponent).join(",")}`,
    );
    const pairs = parsePairs(raw);
    for (const addr of chunk) {
      const best = pickBestPair(pairs, chainId, addr);
      if (best) result.set(addr, best);
    }
  }
  return result;
}

/** Market-data columns of public.tokens, shared by every data source. */
export interface MarketRow {
  pair_address: string | null;
  dex_id: string | null;
  pair_url: string | null;
  name: string | null;
  symbol: string | null;
  image_url: string | null;
  price_usd: number | null;
  price_native: number | null;
  market_cap: number | null;
  fdv: number | null;
  liquidity_usd: number | null;
  volume_m5: number | null;
  volume_h1: number | null;
  volume_h6: number | null;
  volume_h24: number | null;
  change_m5: number | null;
  change_h1: number | null;
  change_h6: number | null;
  change_h24: number | null;
  txns: unknown;
  pair_created_at: string | null;
}

/** Map a pair to the columns of public.tokens. */
export function pairToTokenRow(p: DexPair): MarketRow {
  return {
    pair_address: p.pairAddress,
    dex_id: p.dexId ?? null,
    pair_url: p.url ?? null,
    name: p.baseToken.name ?? null,
    symbol: p.baseToken.symbol ?? null,
    image_url: p.info?.imageUrl ?? null,
    price_usd: p.priceUsd,
    price_native: p.priceNative,
    market_cap: p.marketCap,
    fdv: p.fdv,
    liquidity_usd: p.liquidity?.usd ?? null,
    volume_m5: p.volume?.m5 ?? null,
    volume_h1: p.volume?.h1 ?? null,
    volume_h6: p.volume?.h6 ?? null,
    volume_h24: p.volume?.h24 ?? null,
    change_m5: p.priceChange?.m5 ?? null,
    change_h1: p.priceChange?.h1 ?? null,
    change_h6: p.priceChange?.h6 ?? null,
    change_h24: p.priceChange?.h24 ?? null,
    txns: p.txns ?? null,
    pair_created_at: p.pairCreatedAt ? new Date(p.pairCreatedAt).toISOString() : null,
  };
}
