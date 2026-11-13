import { NextResponse } from "next/server";
import { L } from "@/lib/i18n";
import { handler, HttpError, requireUser, zodMessage } from "@/lib/api";
import { lookupToken } from "@/lib/market/dexscreener";
import { addressSchema, SUPPORTED_CHAINS } from "@/lib/validation";

/** Preview a token before adding it. Returns one candidate per chain. */
export const GET = handler(async (req: Request) => {
  await requireUser();
  const address = new URL(req.url).searchParams.get("address") ?? "";
  const parsed = addressSchema.safeParse(address);
  if (!parsed.success) throw new HttpError(400, "INVALID_ADDRESS", zodMessage(parsed.error));

  const all = await lookupToken(parsed.data);
  const candidates = all.filter((c) => (SUPPORTED_CHAINS as readonly string[]).includes(c.chainId));
  if (candidates.length === 0) {
    throw new HttpError(
      404,
      "TOKEN_NOT_FOUND",
      all.length
        ? L("The token exists, but only on chains PeakAlert doesn't support yet.", "El token existe pero solo en redes que PeakAlert aún no soporta.")
        : L("DexScreener has no priced pairs for this address. Check the address or try again later.", "DexScreener no tiene pares con precio para esta dirección. Verifica la dirección o inténtalo más tarde."),
    );
  }
  return NextResponse.json({ candidates, fetchedAt: new Date().toISOString() });
});
