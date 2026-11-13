import { NextResponse } from "next/server";
import { L } from "@/lib/i18n";
import { handler, HttpError, requireUser, zodMessage } from "@/lib/api";
import { lookupToken } from "@/lib/market/dexscreener";
import { addressSchema } from "@/lib/validation";

/**
 * Preview a token before adding it. Accepts a token CA, a pair address or a pasted link
 * (DexScreener, Pump.fun, Birdeye…). Works on every chain DexScreener tracks.
 */
export const GET = handler(async (req: Request) => {
  await requireUser();
  const parsed = addressSchema.safeParse(new URL(req.url).searchParams.get("address") ?? "");
  if (!parsed.success) throw new HttpError(400, "INVALID_ADDRESS", zodMessage(parsed.error));

  const { candidates, reason, resolvedFromPair } = await lookupToken(parsed.data);
  if (candidates.length === 0) {
    throw new HttpError(
      404,
      reason === "no_usd_price" ? "NO_USD_PRICE" : "TOKEN_NOT_FOUND",
      reason === "no_usd_price"
        ? L(
            "This token only trades against another token, so DexScreener doesn't give it a USD price or liquidity yet (common on some bonding curves). PeakAlert can't track it without real price data — try again once it has a SOL/USDC/ETH pair.",
            "Este token solo cotiza contra otro token, así que DexScreener aún no le da precio en USD ni liquidez (pasa en algunas bonding curves). PeakAlert no puede seguirlo sin datos de precio reales — vuelve a intentarlo cuando tenga un par con SOL/USDC/ETH.",
          )
        : L(
            "DexScreener has no pairs for this address yet. Check it's the token's contract address (not a wallet). Brand-new tokens can take a few minutes to appear.",
            "DexScreener aún no tiene pares para esta dirección. Comprueba que sea la contract address del token (no una wallet). Los tokens recién creados pueden tardar unos minutos en aparecer.",
          ),
    );
  }
  return NextResponse.json({ candidates, resolvedFromPair: resolvedFromPair ?? null, fetchedAt: new Date().toISOString() });
});
