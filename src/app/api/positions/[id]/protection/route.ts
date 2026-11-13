import { NextResponse } from "next/server";
import { L } from "@/lib/i18n";
import { handler, HttpError, requireUser } from "@/lib/api";
import { refreshTokens } from "@/lib/market/refresh";
import { protectionSummary, simulateTrailingStops } from "@/lib/protection";
import { uuidSchema } from "@/lib/validation";

/** Profit Protection analysis for one position (Pro+). */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/positions/[id]/protection">) => {
  const { user, plan, admin } = await requireUser();
  if (!plan.portfolio) throw new HttpError(403, "PLAN_FEATURE", L("Profit Protection is available on Pro and Premium.", "Profit Protection está disponible en Pro y Premium."));
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "INVALID_ID", L("Invalid ID.", "ID no válido."));

  const { data: pos } = await admin.from("positions").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!pos) throw new HttpError(404, "NOT_FOUND", L("Position not found.", "Posición no encontrada."));

  try {
    await refreshTokens(admin, [pos.token_id]);
  } catch (e) {
    console.error("[protection] refresh failed", e);
  }

  const [{ data: token }, { data: rules }] = await Promise.all([
    admin.from("tokens").select("id, symbol, name, chain_id, image_url, price_usd, market_cap, data_updated_at, risk_score, risk_level, pair_url").eq("id", pos.token_id).single(),
    admin.from("alert_rules").select("*").eq("user_id", user.id).eq("position_id", id).order("created_at"),
  ]);

  const entryPrice = Number(pos.entry_price);
  const invested = Number(pos.invested_usd);
  const closed = pos.exit_price != null;
  const end = closed ? Date.parse(pos.exit_at) : Date.now();
  const start = Date.parse(pos.entry_at);
  const span = Math.max(60, Math.ceil((end - start) / 1000));
  // PostgREST caps responses at 1000 rows → adapt the bucket size to the span.
  const bucket = Math.max(60, Math.ceil(span / 900));

  const { data: hist } = await admin.rpc("token_history", {
    p_token: pos.token_id,
    p_since: new Date(start).toISOString(),
    p_bucket_seconds: bucket,
  });
  const path = ((hist ?? []) as { t: string; price: number; market_cap: number | null }[])
    .map((h) => ({ t: Date.parse(h.t), price: Number(h.price), marketCap: h.market_cap == null ? null : Number(h.market_cap) }))
    .filter((p) => p.t <= end && Number.isFinite(p.price));

  const price = closed ? Number(pos.exit_price) : token?.price_usd != null ? Number(token.price_usd) : null;
  const peak = Math.max(Number(pos.peak_price ?? entryPrice), ...path.map((p) => p.price));
  const summary = protectionSummary(entryPrice, invested, peak, price);
  const simulations = simulateTrailingStops(path, entryPrice, invested);

  return NextResponse.json({
    position: pos,
    token,
    closed,
    summary,
    simulations,
    path: path.map((p) => ({ t: new Date(p.t).toISOString(), price: p.price, market_cap: p.marketCap })),
    /** First moment PeakAlert has price data for, within this position's lifetime. */
    coverageStart: path[0] ? new Date(path[0].t).toISOString() : null,
    bucketSeconds: bucket,
    rules: rules ?? [],
    serverTime: new Date().toISOString(),
  });
});
