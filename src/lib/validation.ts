import { z } from "zod";
import { msg } from "./i18n";

/**
 * PeakAlert accepts ANY chain DexScreener tracks (Solana, Base, BNB, Tron, PulseChain, XRPL…).
 * These are just friendly labels; unknown chain ids get a generated label.
 */
export const CHAIN_LABEL: Record<string, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
  bsc: "BNB Chain",
  arbitrum: "Arbitrum",
  polygon: "Polygon",
  avalanche: "Avalanche",
  optimism: "Optimism",
  sui: "Sui",
  ton: "TON",
  tron: "Tron",
  pulsechain: "PulseChain",
  xrpl: "XRPL",
  hyperevm: "HyperEVM",
  hyperliquid: "Hyperliquid",
  abstract: "Abstract",
  sonic: "Sonic",
  blast: "Blast",
  linea: "Linea",
  zksync: "zkSync",
  apechain: "ApeChain",
  cronos: "Cronos",
  aptos: "Aptos",
  near: "NEAR",
  robinhood: "Robinhood",
  monad: "Monad",
  berachain: "Berachain",
  unichain: "Unichain",
  mantle: "Mantle",
  scroll: "Scroll",
};

export function chainLabel(chainId: string): string {
  return CHAIN_LABEL[chainId] ?? chainId.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
/** Solana: base58, 32–44 chars (no 0, O, I, l). */
export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** Sui / Aptos coin type: 0x<hex>::module::NAME */
export const SUI_COIN = /^0x[a-fA-F0-9]{1,64}::[A-Za-z0-9_]+::[A-Za-z0-9_]+$/;
/** TON user-friendly address (base64url, 48 chars). */
export const TON_ADDRESS = /^[A-Za-z0-9_-]{48}$/;
/** Anything else DexScreener may use as a token id (Tron, XRPL "CODE.rIssuer", NEAR names…). */
export const GENERIC_ADDRESS = /^[A-Za-z0-9][A-Za-z0-9._:\-]{19,127}$/;

export type AddressKind = "evm" | "solana" | "sui" | "ton" | "other";

export function detectAddressKind(input: string): AddressKind | null {
  const a = input.trim();
  if (EVM_ADDRESS.test(a)) return "evm";
  if (SUI_COIN.test(a)) return "sui";
  if (SOLANA_ADDRESS.test(a)) return "solana";
  if (TON_ADDRESS.test(a)) return "ton";
  if (GENERIC_ADDRESS.test(a)) return "other";
  return null;
}

/** 0x-hex addresses are case-insensitive on every EVM chain → store lowercase. Others are case-sensitive. */
export function isCaseInsensitiveAddress(address: string) {
  return EVM_ADDRESS.test(address.trim());
}

export function normalizeAddress(_chainId: string, address: string): string {
  const a = address.trim();
  return isCaseInsensitiveAddress(a) ? a.toLowerCase() : a;
}

/**
 * Accept what people actually paste: a raw CA, or a link from DexScreener, Pump.fun,
 * Birdeye, GMGN, Photon, Solscan, Etherscan… → take the last path segment that looks like an address.
 */
export function extractAddress(input: string): string {
  const raw = input.trim();
  if (!/^https?:\/\//i.test(raw) && !raw.includes("/")) return raw;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const parts = url.pathname.split("/").filter(Boolean).reverse();
    const hit = parts.find((seg) => detectAddressKind(decodeURIComponent(seg)) && seg.length >= 25);
    if (hit) return decodeURIComponent(hit);
    for (const key of ["address", "token", "ca", "outputMint", "inputCurrency", "outputCurrency"]) {
      const v = url.searchParams.get(key);
      if (v && detectAddressKind(v)) return v;
    }
  } catch {
    /* not a URL */
  }
  return raw;
}

export const addressSchema = z
  .string()
  .trim()
  .min(1, msg("Enter an address", "Ingresa una dirección"))
  .max(500, msg("Address too long", "Dirección demasiado larga"))
  .transform(extractAddress)
  .refine((a) => a.length <= 200 && detectAddressKind(a) !== null, {
    message: msg("That doesn't look like a contract address. Paste the token's CA.", "Eso no parece una contract address. Pega la CA del token."),
  });

export const chainSchema = z.string().regex(/^[a-z0-9-]{2,32}$/, msg("Invalid chain", "Red no válida"));

export const uuidSchema = z.string().uuid();

export const addTokenSchema = z.object({
  address: addressSchema,
  chainId: chainSchema,
});

const positiveNumber = z.coerce.number().finite().positive().max(1e15);
const isoDate = z.coerce.date().refine((d) => d.getTime() <= Date.now() + 5 * 60_000, {
  message: msg("The date can't be in the future", "La fecha no puede estar en el futuro"),
});

/**
 * Either an entry price or an entry market cap is required. With only a market cap,
 * the server derives the entry price from the current price/market-cap ratio
 * (assumes the circulating supply hasn't changed since the purchase).
 */
export const createPositionSchema = z
  .object({
    tokenId: uuidSchema,
    entryPrice: positiveNumber.optional(),
    entryMarketCap: positiveNumber.optional(),
    investedUsd: positiveNumber,
    entryAt: isoDate.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.entryPrice != null || v.entryMarketCap != null, {
    message: msg("Enter the entry price or the entry market cap", "Indica el precio de entrada o el market cap de entrada"),
  });

/** exitPrice = null reopens the position. exitPrice without exitAt uses "now". */
export const updatePositionSchema = z.object({
  entryPrice: positiveNumber.optional(),
  investedUsd: positiveNumber.optional(),
  entryAt: isoDate.optional(),
  exitPrice: positiveNumber.nullable().optional(),
  exitAt: isoDate.optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
