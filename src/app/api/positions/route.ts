import { NextResponse } from "next/server";
import { handler, HttpError, readJson, requireUser, zodMessage } from "@/lib/api";
import { createPositionSchema } from "@/lib/validation";

function requirePortfolio(plan: { portfolio: boolean }) {
  if (!plan.portfolio) throw new HttpError(403, "PLAN_FEATURE", "Profit Protection está disponible en Pro y Premium.");
}

export const GET = handler(async () => {
  const { user, plan, admin } = await requireUser();
  requirePortfolio(plan);
  const { data, error } = await admin
    .from("positions")
    .select("*, token:tokens(id, symbol, name, chain_id, image_url, price_usd, market_cap, data_updated_at, risk_score, risk_level)")
    .eq("user_id", user.id)
    .order("entry_at", { ascending: false });
  if (error) throw error;
  return NextResponse.json({ positions: data ?? [], serverTime: new Date().toISOString() });
});

export const POST = handler(async (req: Request) => {
  const { user, plan, admin } = await requireUser();
  requirePortfolio(plan);
  const body = createPositionSchema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "INVALID_INPUT", zodMessage(body.error));
  const { tokenId, investedUsd, entryAt, notes, entryMarketCap } = body.data;

  const { data: token } = await admin.from("tokens").select("id, price_usd, market_cap").eq("id", tokenId).maybeSingle();
  if (!token) throw new HttpError(404, "NOT_FOUND", "Token no encontrado. Agrégalo primero a tu lista.");

  let entryPrice = body.data.entryPrice;
  if (entryPrice == null) {
    // Derive from entry market cap using the current price / market-cap ratio (same supply assumed).
    const price = Number(token.price_usd);
    const mc = Number(token.market_cap);
    if (!(price > 0) || !(mc > 0)) {
      throw new HttpError(400, "NO_MARKET_CAP", "No hay market cap actual para calcular el precio de entrada. Indica el precio de entrada.");
    }
    entryPrice = entryMarketCap! * (price / mc);
  }
  const start = entryAt ?? new Date();

  // Highest price PeakAlert observed since the entry (unknown before tracking started).
  const { data: hist } = await admin.rpc("token_history", {
    p_token: tokenId,
    p_since: start.toISOString(),
    p_bucket_seconds: 300,
  });
  const observed = ((hist ?? []) as { price: number }[]).map((h) => Number(h.price));
  const current = Number(token.price_usd);
  const peak = Math.max(entryPrice, ...(Number.isFinite(current) && current > 0 ? [current] : []), ...observed);

  const { data, error } = await admin
    .from("positions")
    .insert({
      user_id: user.id,
      token_id: tokenId,
      entry_price: entryPrice,
      entry_market_cap: entryMarketCap ?? null,
      invested_usd: investedUsd,
      entry_at: start.toISOString(),
      notes: notes || null,
      peak_price: peak,
      peak_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return NextResponse.json({ position: data }, { status: 201 });
});
