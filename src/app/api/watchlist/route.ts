import { NextResponse } from "next/server";
import { handler, HttpError, readJson, requireUser, zodMessage } from "@/lib/api";
import { fetchPairsForChain, pairToTokenRow } from "@/lib/market/dexscreener";
import { refreshTokens } from "@/lib/market/refresh";
import { addTokenSchema, normalizeAddress } from "@/lib/validation";

const TOKEN_COLUMNS =
  "id, chain_id, address, pair_address, dex_id, pair_url, name, symbol, image_url, price_usd, market_cap, fdv, liquidity_usd, volume_m5, volume_h1, volume_h6, volume_h24, change_m5, change_h1, change_h6, change_h24, txns, pair_created_at, peak_price, peak_market_cap, peak_at, data_updated_at, last_error, last_error_at, risk_score, risk_level, risk_coverage, momentum_score, risk_updated_at, data_source";

/** List watched tokens. Refreshes stale market data first (max every 30 s per token). */
export const GET = handler(async () => {
  const { user, plan, admin } = await requireUser();
  const { data: rows, error } = await admin
    .from("watchlist")
    .select("token_id, created_at, added_price")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const ids = (rows ?? []).map((r) => r.token_id);

  let refreshError: string | null = null;
  try {
    const s = await refreshTokens(admin, ids);
    if (s.errors.length) refreshError = s.errors.join("; ");
  } catch (e) {
    console.error("[watchlist] refresh failed", e);
    refreshError = "No se pudieron actualizar los datos de mercado. Se muestran los últimos disponibles.";
  }

  const { data: tokens } = ids.length
    ? await admin.from("tokens").select(TOKEN_COLUMNS).in("id", ids)
    : { data: [] };

  // 24h sparkline, bucketed to 30 min, for all tokens in one round trip
  const sparkMap = new Map<string, number[]>();
  if (ids.length) {
    const { data: sparks } = await admin.rpc("token_sparklines", {
      p_tokens: ids,
      p_since: new Date(Date.now() - 24 * 3600_000).toISOString(),
      p_bucket_seconds: 1800,
    });
    for (const row of (sparks ?? []) as { token_id: string; prices: (number | string)[] }[]) {
      sparkMap.set(row.token_id, row.prices.map(Number));
    }
  }
  const order = new Map(ids.map((id, i) => [id, i]));

  return NextResponse.json({
    tokens: (tokens ?? [])
      .map((t) => {
        const w = rows!.find((r) => r.token_id === t.id)!;
        return { ...t, sparkline: sparkMap.get(t.id) ?? [], added_price: w.added_price, added_at: w.created_at };
      })
      .sort((a, b) => order.get(a.id)! - order.get(b.id)!),
    limit: plan.maxTokens,
    plan: plan.id,
    refreshError,
    serverTime: new Date().toISOString(),
  });
});

/** Add a token by contract address. */
export const POST = handler(async (req: Request) => {
  const { user, plan, admin } = await requireUser();
  const parsed = addTokenSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "INVALID_INPUT", zodMessage(parsed.error));
  const chainId = parsed.data.chainId;
  const address = normalizeAddress(chainId, parsed.data.address);

  const { count } = await admin
    .from("watchlist")
    .select("token_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= plan.maxTokens) {
    throw new HttpError(
      403,
      "PLAN_TOKEN_LIMIT",
      `Tu plan ${plan.name} permite seguir hasta ${plan.maxTokens} tokens.`,
      { limit: plan.maxTokens },
    );
  }

  // Validate against live market data before storing anything.
  const pairs = await fetchPairsForChain(chainId, [address]);
  const pair = pairs.get(address);
  if (!pair || pair.priceUsd == null) {
    throw new HttpError(404, "TOKEN_NOT_FOUND", "No hay datos de mercado para este token en esa red.");
  }

  const now = new Date().toISOString();
  const row = pairToTokenRow(pair);
  const { data: existing } = await admin
    .from("tokens")
    .select("id")
    .eq("chain_id", chainId)
    .eq("address", address)
    .maybeSingle();

  let tokenId = existing?.id as string | undefined;
  if (!tokenId) {
    const { data: inserted, error } = await admin
      .from("tokens")
      .insert({
        chain_id: chainId,
        address,
        ...row,
        peak_price: row.price_usd,
        peak_market_cap: row.market_cap,
        peak_at: now,
        data_updated_at: now,
        last_snapshot_at: now,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code !== "23505") throw error;
      // Race: someone else inserted it a moment ago.
      const { data: again } = await admin.from("tokens").select("id").eq("chain_id", chainId).eq("address", address).single();
      tokenId = again!.id;
    } else {
      tokenId = inserted.id;
      await admin.from("token_snapshots").insert({
        token_id: tokenId,
        captured_at: now,
        price_usd: row.price_usd,
        market_cap: row.market_cap,
        liquidity_usd: row.liquidity_usd,
        volume_h1: row.volume_h1,
        volume_h24: row.volume_h24,
      });
    }
  }

  const { error: wErr } = await admin.from("watchlist").insert({ user_id: user.id, token_id: tokenId, added_price: row.price_usd });
  if (wErr) {
    if (wErr.code === "23505") throw new HttpError(409, "ALREADY_WATCHING", "Ya sigues este token.");
    if (wErr.message?.includes("PLAN_TOKEN_LIMIT"))
      throw new HttpError(403, "PLAN_TOKEN_LIMIT", `Tu plan ${plan.name} permite seguir hasta ${plan.maxTokens} tokens.`);
    throw wErr;
  }
  return NextResponse.json({ tokenId }, { status: 201 });
});
