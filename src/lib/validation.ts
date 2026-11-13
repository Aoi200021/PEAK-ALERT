import { z } from "zod";
import { msg } from "./i18n";

/** Chains PeakAlert supports. DexScreener chain ids. */
export const SUPPORTED_CHAINS = [
  "solana",
  "ethereum",
  "base",
  "bsc",
  "arbitrum",
  "polygon",
  "avalanche",
  "optimism",
  "sui",
  "ton",
] as const;
export type ChainId = (typeof SUPPORTED_CHAINS)[number];

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
};

const EVM_CHAINS = new Set(["ethereum", "base", "bsc", "arbitrum", "polygon", "avalanche", "optimism"]);

export const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
/** Solana: base58, 32–44 chars (no 0, O, I, l). */
export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** Sui coin type: 0x<64 hex>::module::NAME */
export const SUI_COIN = /^0x[a-fA-F0-9]{1,64}::[A-Za-z0-9_]+::[A-Za-z0-9_]+$/;
/** TON user-friendly address (base64url, 48 chars). */
export const TON_ADDRESS = /^[A-Za-z0-9_-]{48}$/;

export type AddressKind = "evm" | "solana" | "sui" | "ton";

export function detectAddressKind(input: string): AddressKind | null {
  const a = input.trim();
  if (EVM_ADDRESS.test(a)) return "evm";
  if (SUI_COIN.test(a)) return "sui";
  if (SOLANA_ADDRESS.test(a)) return "solana";
  if (TON_ADDRESS.test(a)) return "ton";
  return null;
}

/** EVM addresses are case-insensitive → store lowercase. Others are case-sensitive. */
export function normalizeAddress(chainId: string, address: string): string {
  const a = address.trim();
  return EVM_CHAINS.has(chainId) ? a.toLowerCase() : a;
}

export function isEvmChain(chainId: string) {
  return EVM_CHAINS.has(chainId);
}

export const addressSchema = z
  .string()
  .trim()
  .min(1, msg("Enter an address", "Ingresa una dirección"))
  .max(200, msg("Address too long", "Dirección demasiado larga"))
  .refine((a) => detectAddressKind(a) !== null, {
    message: msg("Invalid address format (EVM 0x…, Solana base58, Sui or TON)", "Formato de dirección no válido (EVM 0x…, Solana base58, Sui o TON)"),
  });

export const chainSchema = z.enum(SUPPORTED_CHAINS);

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
