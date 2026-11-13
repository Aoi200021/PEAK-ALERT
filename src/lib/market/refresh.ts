import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateRule } from "../alerts/engine";
import type { AlertType, MarketData } from "../alerts/types";
import { toNum } from "../format";
import { notifyUser } from "../notifications";
import { advancePaperExit, type PaperExitRow } from "../paper-exit";
import { fetchPairsForChain, MarketApiError, pairToTokenRow } from "./dexscreener";

/** DexScreener caches ~30 s, so refreshing more often only burns rate limit. */
export const STALE_AFTER_MS = 30_000;
const SNAPSHOT_EVERY_MS = 55_000;

export interface TokenRow {
  id: string;
  chain_id: string;
  address: string;
  symbol: string | null;
  name: string | null;
  price_usd: number | string | null;
  market_cap: number | string | null;
  liquidity_usd: number | string | null;
  volume_m5: number | string | null;
  volume_h1: number | string | null;
  volume_h6: number | string | null;
  volume_h24: number | string | null;
  change_m5: number | string | null;
  change_h1: number | string | null;
  change_h6: number | string | null;
  change_h24: number | string | null;
  txns: { h1?: { buys?: number; sells?: number } | null } | null;
  peak_price: number | string | null;
  peak_market_cap: number | string | null;
  peak_at: string | null;
  data_updated_at: string | null;
  last_snapshot_at: string | null;
}

export function rowToMarket(row: TokenRow): MarketData {
  const h1 = row.txns?.h1;
  return {
    priceUsd: toNum(row.price_usd),
    marketCap: toNum(row.market_cap),
    volume: {
      m5: toNum(row.volume_m5),
      h1: toNum(row.volume_h1),
      h6: toNum(row.volume_h6),
      h24: toNum(row.volume_h24),
    },
    change: {
      m5: toNum(row.change_m5),
      h1: toNum(row.change_h1),
      h6: toNum(row.change_h6),
      h24: toNum(row.change_h24),
    },
    txnsH1: h1 ? { buys: h1.buys ?? 0, sells: h1.sells ?? 0 } : null,
    updatedAt: row.data_updated_at ? new Date(row.data_updated_at) : null,
  };
}

export interface RefreshSummary {
  requested: number;
  fetched: number;
  missing: number;
  errors: string[];
  alertsFired: number;
}

/**
 * Refresh market data for the given tokens, store snapshots, evaluate every
 * enabled alert rule on them, and advance open Paper Exits.
 * Safe to call concurrently (rule firing uses optimistic locking).
 */
export async function refreshTokens(
  admin: SupabaseClient,
  tokenIds: string[],
  opts: { force?: boolean } = {},
): Promise<RefreshSummary> {
  const summary: RefreshSummary = { requested: tokenIds.length, fetched: 0, missing: 0, errors: [], alertsFired: 0 };
  if (tokenIds.length === 0) return summary;

  const { data: tokens, error } = await admin.from("tokens").select("*").in("id", tokenIds);
  if (error) throw error;

  const now = new Date();
  const due = (tokens as TokenRow[]).filter(
    (t) => opts.force || !t.data_updated_at || now.getTime() - Date.parse(t.data_updated_at) >= STALE_AFTER_MS,
  );
  if (due.length === 0) return summary;

  // ---- 1. Fetch from DexScreener, grouped by chain ----
  const byChain = new Map<string, TokenRow[]>();
  for (const t of due) byChain.set(t.chain_id, [...(byChain.get(t.chain_id) ?? []), t]);

  const updates: Record<string, unknown>[] = [];
  const snapshots: Record<string, unknown>[] = [];
  const refreshed: TokenRow[] = [];
  const failures: { id: string; error: string }[] = [];

  for (const [chainId, list] of byChain) {
    let pairs;
    try {
      pairs = await fetchPairsForChain(chainId, list.map((t) => t.address));
    } catch (e) {
      const msg = e instanceof MarketApiError ? e.message : "Error al consultar DexScreener";
      summary.errors.push(`${chainId}: ${msg}`);
      list.forEach((t) => failures.push({ id: t.id, error: msg }));
      continue;
    }
    for (const t of list) {
      const pair = pairs.get(t.address);
      if (!pair || pair.priceUsd == null) {
        summary.missing++;
        failures.push({ id: t.id, error: "Sin datos de mercado disponibles para este token" });
        continue;
      }
      const row = pairToTokenRow(pair);
      const price = row.price_usd!;
      const prevPeak = toNum(t.peak_price);
      const prevPeakMc = toNum(t.peak_market_cap);
      const newPeak = prevPeak == null || price > prevPeak;
      const snapshotDue = !t.last_snapshot_at || now.getTime() - Date.parse(t.last_snapshot_at) >= SNAPSHOT_EVERY_MS;
      const update = {
        id: t.id,
        chain_id: t.chain_id,
        address: t.address,
        ...row,
        peak_price: newPeak ? price : prevPeak,
        peak_market_cap:
          row.market_cap != null ? Math.max(prevPeakMc ?? 0, row.market_cap) : prevPeakMc,
        // Bulk upsert sets missing keys to NULL → every row must carry the same keys.
        peak_at: newPeak ? now.toISOString() : t.peak_at,
        data_updated_at: now.toISOString(),
        last_error: null,
        last_error_at: null,
        last_snapshot_at: snapshotDue ? now.toISOString() : t.last_snapshot_at,
      };
      updates.push(update);
      refreshed.push({ ...t, ...update } as unknown as TokenRow);
      if (snapshotDue) {
        snapshots.push({
          token_id: t.id,
          captured_at: now.toISOString(),
          price_usd: price,
          market_cap: row.market_cap,
          liquidity_usd: row.liquidity_usd,
          volume_h1: row.volume_h1,
          volume_h24: row.volume_h24,
        });
      }
    }
  }

  // ---- 2. Persist ----
  if (updates.length) {
    const { error: upErr } = await admin.from("tokens").upsert(updates, { onConflict: "id" });
    if (upErr) throw upErr;
    summary.fetched = updates.length;
  }
  if (snapshots.length) {
    const { error: snErr } = await admin.from("token_snapshots").insert(snapshots);
    if (snErr) summary.errors.push(`snapshots: ${snErr.message}`);
  }
  for (const f of failures) {
    // Keep the last good data; just record the error. The UI shows the data age.
    await admin
      .from("tokens")
      .update({ last_error: f.error, last_error_at: now.toISOString() })
      .eq("id", f.id);
  }

  if (refreshed.length === 0) return summary;

  // ---- 3. Alerts ----
  summary.alertsFired = await evaluateRulesFor(admin, refreshed, now);

  // ---- 4. Paper exits ----
  await advancePaperExits(admin, refreshed, now);

  return summary;
}

interface RuleRow {
  id: string;
  user_id: string;
  token_id: string;
  type: AlertType;
  params: unknown;
  armed: boolean;
  state: Record<string, unknown>;
  version: number;
  cooldown_minutes: number;
  last_triggered_at: string | null;
}

async function evaluateRulesFor(admin: SupabaseClient, tokens: TokenRow[], now: Date): Promise<number> {
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const { data: rules, error } = await admin
    .from("alert_rules")
    .select("id, user_id, token_id, type, params, armed, state, version, cooldown_minutes, last_triggered_at")
    .eq("enabled", true)
    .in("token_id", [...byId.keys()]);
  if (error) throw error;

  let fired = 0;
  for (const rule of (rules ?? []) as RuleRow[]) {
    const token = byId.get(rule.token_id)!;
    const market = rowToMarket(token);
    const res = evaluateRule(
      {
        type: rule.type,
        params: rule.params,
        armed: rule.armed,
        state: rule.state ?? {},
        cooldownMinutes: rule.cooldown_minutes,
        lastTriggeredAt: rule.last_triggered_at ? new Date(rule.last_triggered_at) : null,
      },
      market,
      now,
    );

    const changed =
      res.fire || res.armed !== rule.armed || JSON.stringify(res.state) !== JSON.stringify(rule.state ?? {});
    if (!changed) continue;

    // Optimistic lock: if another worker already updated this rule, skip (prevents duplicate alerts).
    const { data: claimed } = await admin
      .from("alert_rules")
      .update({
        armed: res.armed,
        state: res.state,
        version: rule.version + 1,
        last_evaluated_at: now.toISOString(),
        ...(res.fire ? { last_triggered_at: now.toISOString() } : {}),
      })
      .eq("id", rule.id)
      .eq("version", rule.version)
      .select("id");
    if (!claimed?.length || !res.fire || !res.event) continue;

    fired++;
    await recordAlert(admin, rule, token, market, res.event, now);
  }
  return fired;
}

async function recordAlert(
  admin: SupabaseClient,
  rule: RuleRow,
  token: TokenRow,
  market: MarketData,
  event: { title: string; message: string; metrics: Record<string, unknown> },
  now: Date,
) {
  const symbol = token.symbol ?? "Token";
  const { data: ev, error } = await admin
    .from("alert_events")
    .insert({
      user_id: rule.user_id,
      rule_id: rule.id,
      token_id: token.id,
      type: rule.type,
      title: `${symbol}: ${event.title}`,
      message: event.message,
      price_usd: market.priceUsd,
      market_cap: market.marketCap,
      metrics: event.metrics,
      created_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (error || !ev) {
    console.error("[alerts] insert event failed", error);
    return;
  }

  // Paper Exit: link to the user's open position on this token, if any.
  if (market.priceUsd != null) {
    const { data: pos } = await admin
      .from("positions")
      .select("id, entry_price, invested_usd")
      .eq("user_id", rule.user_id)
      .eq("token_id", token.id)
      .is("exit_price", null)
      .order("entry_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    await admin.from("paper_exits").insert({
      event_id: ev.id,
      user_id: rule.user_id,
      token_id: token.id,
      position_id: pos?.id ?? null,
      alert_price: market.priceUsd,
      entry_price: pos ? Number(pos.entry_price) : null,
      quantity: pos ? Number(pos.invested_usd) / Number(pos.entry_price) : null,
      last_price: market.priceUsd,
      last_checked_at: now.toISOString(),
    });
  }

  const n = await notifyUser(admin, rule.user_id, {
    title: `${symbol}: ${event.title}`,
    body: event.message,
    url: `/tokens/${token.id}`,
    tag: `rule-${rule.id}`,
  });
  await admin
    .from("alert_events")
    .update({ notified_at: n.delivered > 0 ? now.toISOString() : null, notify_error: n.error })
    .eq("id", ev.id);
}

async function advancePaperExits(admin: SupabaseClient, tokens: TokenRow[], now: Date) {
  const prices = new Map(tokens.map((t) => [t.id, toNum(t.price_usd)]));
  const { data: open } = await admin
    .from("paper_exits")
    .select("id, token_id, created_at, alert_price, checkpoints, max_price_after, min_price_after")
    .eq("closed", false)
    .in("token_id", [...prices.keys()]);
  for (const pe of open ?? []) {
    const price = prices.get(pe.token_id);
    if (price == null) continue;
    const patch = advancePaperExit(
      {
        created_at: pe.created_at,
        alert_price: Number(pe.alert_price),
        checkpoints: pe.checkpoints ?? {},
        max_price_after: toNum(pe.max_price_after),
        min_price_after: toNum(pe.min_price_after),
      } satisfies PaperExitRow,
      price,
      now,
    );
    await admin.from("paper_exits").update(patch).eq("id", pe.id);
  }
}

/** Used by the cron endpoint: everything someone watches, alerts on, or paper-tracks. */
export async function refreshAllTracked(admin: SupabaseClient) {
  const { data, error } = await admin.rpc("tracked_token_ids");
  if (error) throw error;
  const ids = (data as unknown[]).map((r) => (typeof r === "string" ? r : (r as { tracked_token_ids: string }).tracked_token_ids));
  return refreshTokens(admin, ids);
}
