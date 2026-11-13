import { NextResponse } from "next/server";
import { analyzePublicAddress } from "@/lib/market/public";
import { MarketApiError } from "@/lib/market/dexscreener";
import { addressSchema, SOLANA_ADDRESS } from "@/lib/validation";
import { fetchJupiterTokens } from "@/lib/market/jupiter";
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
      // Exists on a launchpad but nobody traded it yet? Say so instead of a generic error.
      const jup = SOLANA_ADDRESS.test(parsed.data) ? (await fetchJupiterTokens([parsed.data])).get(parsed.data) : undefined;
      if (jup) {
        const name = jup.symbol ?? jup.name ?? "?";
        const where = jup.launchpad ?? "launchpad";
        const holders = jup.holderCount != null ? ` (${jup.holderCount} holder${jup.holderCount === 1 ? "" : "s"})` : "";
        return NextResponse.json(
          {
            error: {
              code: "NO_TRADES",
              message: tr(
                `${name} exists on ${where} but has no trades yet${holders}, so there's no real price to analyze. Any market cap shown elsewhere is theoretical.`,
                `${name} existe en ${where} pero aún no tiene operaciones${holders}, así que no hay un precio real que analizar. Cualquier market cap que veas en otro sitio es teórico.`,
              ),
            },
          },
          { status: 404 },
        );
      }
      return NextResponse.json(
        {
          error: {
            code: "TOKEN_NOT_FOUND",
            message: tr(
              "No market data for this address yet. Check it's the token's contract address; brand-new tokens can take a few minutes to appear.",
              "Aún no hay datos de mercado para esta dirección. Comprueba que sea la contract address del token; los tokens recién creados pueden tardar unos minutos en aparecer.",
            ),
          },
        },
        { status: 404 },
      );
    }
    return NextResponse.json({ tokens, fetchedAt: new Date().toISOString() });
  } catch (e) {
    const m = e instanceof MarketApiError ? pickMsg(e.message, locale) : tr("Couldn't fetch the token.", "No se pudo consultar el token.");
    return NextResponse.json({ error: { code: "MARKET_API", message: m } }, { status: 503 });
  }
}
