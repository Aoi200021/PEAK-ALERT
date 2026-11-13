import { NextResponse } from "next/server";
import { analyzePublicAddress } from "@/lib/market/public";
import { MarketApiError } from "@/lib/market/dexscreener";
import { addressSchema } from "@/lib/validation";
import { pickMsg } from "@/lib/i18n";
import { localeFromRequest } from "@/lib/i18n/server";

/**
 * Public, unauthenticated token analysis for the demo page.
 * Best-effort rate limit per IP (per server instance) + 30 s cache per address,
 * to protect DexScreener's 300 req/min limit.
 */
const WINDOW_MS = 5 * 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

export async function GET(req: Request) {
  const locale = localeFromRequest(req);
  const tr = (en: string, es: string) => (locale === "es" ? es : en);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: tr("Too many searches. Wait a few minutes or create a free account.", "Demasiadas búsquedas. Espera unos minutos o crea una cuenta gratis.") } },
      { status: 429 },
    );
  }
  const parsed = addressSchema.safeParse(new URL(req.url).searchParams.get("address") ?? "");
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_ADDRESS", message: pickMsg(parsed.error.issues[0]?.message ?? tr("Invalid address", "Dirección no válida"), locale) } }, { status: 400 });
  }
  try {
    const tokens = await analyzePublicAddress(parsed.data);
    if (!tokens.length) {
      return NextResponse.json(
        { error: { code: "TOKEN_NOT_FOUND", message: tr("DexScreener has no price data for this address on supported chains.", "DexScreener no tiene datos de precio para esta dirección en las redes soportadas.") } },
        { status: 404 },
      );
    }
    return NextResponse.json({ tokens, fetchedAt: new Date().toISOString() });
  } catch (e) {
    const m = e instanceof MarketApiError ? pickMsg(e.message, locale) : tr("Couldn't fetch the token.", "No se pudo consultar el token.");
    return NextResponse.json({ error: { code: "MARKET_API", message: m } }, { status: 503 });
  }
}
