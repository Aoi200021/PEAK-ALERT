import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateRule } from "../alerts/engine";
import type { AlertExplanation, AlertType, MarketContext, MarketData, Severity } from "../alerts/types";
import { toNum } from "../format";
import { notifyUser } from "../notifications";
import { advancePaperExit, type PaperExitRow } from "../paper-exit";
import { avgPriceLastHour, liquidityChangePct, parseSeriesRow } from "../risk/context";
import { computeMomentum, computeRisk, type RiskMarket, type SeriesPoint } from "../risk/score";
import { getPlan } from "../plans";
import { birdeyeEnabled, fetchBirdeyeRow } from "./birdeye";
import { fetchPairsForChain, MarketApiError, pairToTokenRow, type MarketRow } from "./dexscreener";

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
  txns: { m5?: { buys?: number; sells?: number } | null; h1?: { buys?: number; sells?: number } | null } | null;
  peak_price: number | string | null;
  peak_market_cap: number | string | null;
  peak_at: string | null;
  data_updated_at: string | null;
  last_snapshot_at: string | null;
  risk_score?: number | null;
  risk_factors?: unknown;
  risk_coverage?: number | string | null;
  risk_level?: string | null;
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
    liquidityUsd: toNum(row.liquidity_usd),
  };
}

export function rowToRiskMarket(row: TokenRow): RiskMarket {
  const m = rowToMarket(row);
  const m5 = row.txns?.m5;
  return {
    priceUsd: m.priceUsd,
    marketCap: m.marketCap,
    liquidityUsd: m.liquidityUsd ?? null,
    volume: m.volume,
    change: m.change,
    txnsM5: m5 ? { buys: m5.buys ?? 0, sells: m5.sells ?? 0 } : null,
    txnsH1: m.txnsH1,
  };
}

/** Recent raw snapshots (last 6 h) for many tokens in one call. */
export async function loadRecentSeries(admin: SupabaseClient, tokenIds: string[], sinceMs = 6 * 3600_000) {
  const map = new Map<string, SeriesPoint[]>();
  if (!tokenIds.length) return map;
  const { data, error } = await admin.rpc("token_recent_series", {
    p_tokens: tokenIds,
    p_since: new Date(Date.now() - sinceMs).toISOString(),
  });
  if (error) {
    console.error("[refresh] series failed", error.message);
    return map;
  }
  for (const row of (data ?? []) as Array<Parameters<typeof parseSeriesRow>[0] & { token_id: string }>) {
    map.set(row.token_id, parseSeriesRow(row));
  }
  return map;
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

  const series = await loadRecentSeries(admin, due.map((t) => t.id));
  const contexts = new Map<string, MarketContext>();

  for (const [chainId, list] of byChain) {
    let pairs = new Map<string, MarketRow>();
    let chainError: string | null = null;
    try {
      const raw = await fetchPairsForChain(chainId, list.map((t) => t.address));
      pairs = new Map([...raw].filter(([, p]) => p.priceUsd != null).map(([a, p]) => [a, pairToTokenRow(p)]));
    } catch (e) {
      chainError = e instanceof MarketApiError ? e.message : "Error al consultar DexScreener";
      summary.errors.push(`${chainId}: ${chainError}`);
    }
    for (const t of list) {
      let row = pairs.get(t.address) ?? null;
      let source = "dexscreener";
      // Optional fallback: Birdeye for Solana tokens DexScreener couldn't serve.
      if (!row && chainId === "solana" && birdeyeEnabled()) {
        row = await fetchBirdeyeRow(t.address);
        source = "birdeye";
      }
      if (!row || row.price_usd == null) {
        if (!chainError) summary.missing++;
        failures.push({ id: t.id, error: chainError ?? "Sin datos de mercado disponibles para este token" });
        continue;
      }
      const price = row.price_usd;
      const prevPeak = toNum(t.peak_price);
      const prevPeakMc = toNum(t.peak_market_cap);
      const newPeak = prevPeak == null || price > prevPeak;
      const snapshotDue = !t.last_snapshot_at || now.getTime() - Date.parse(t.last_snapshot_at) >= SNAPSHOT_EVERY_MS;

      // Peak Detection on the fresh data + PeakAlert's own history
      const fresh = { ...t, ...row } as unknown as TokenRow;
      const hist = series.get(t.id) ?? [];
      const risk = computeRisk(rowToRiskMarket(fresh), hist, now.getTime());
      const momentum = computeMomentum(rowToRiskMarket(fresh));
      contexts.set(t.id, {
        risk: {
          score: risk.score,
          coverage: risk.coverage,
          level: risk.level,
          summary: risk.summary,
          factors: risk.factors.map((f) => ({ label: f.label, score: f.score, available: f.available, value: f.value })),
        },
        liquidityChange: {
          "1h": liquidityChangePct(hist, row.liquidity_usd, 3600_000, now.getTime()),
          "6h": liquidityChangePct(hist, row.liquidity_usd, 6 * 3600_000, now.getTime()),
        },
        avgPrice1h: avgPriceLastHour(hist, now.getTime()),
      });

      const update = {
        id: t.id,
        chain_id: t.chain_id,
        address: t.address,
        ...row,
        peak_price: newPeak ? price : prevPeak,
        peak_market_cap: row.market_cap != null ? Math.max(prevPeakMc ?? 0, row.market_cap) : prevPeakMc,
        // Bulk upsert sets missing keys to NULL → every row must carry the same keys.
        peak_at: newPeak ? now.toISOString() : t.peak_at,
        data_updated_at: now.toISOString(),
        data_source: source,
        last_error: null,
        last_error_at: null,
        last_snapshot_at: snapshotDue ? now.toISOString() : t.last_snapshot_at,
        risk_score: risk.score,
        risk_level: risk.level,
        risk_coverage: Number(risk.coverage.toFixed(3)),
        risk_factors: risk.factors,
        momentum_score: momentum,
        risk_updated_at: now.toISOString(),
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
          risk_score: risk.score,
          momentum_score: momentum,
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

  // ---- 3. Positions: track the highest price since entry (Profit Protection) ----
  const positions = await updatePositionPeaks(admin, refreshed, now);

  // ---- 4. Alerts ----
  summary.alertsFired = await evaluateRulesFor(admin, refreshed, contexts, positions, now);

  // ---- 5. Paper exits ----
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
  position_id: string | null;
}

interface PositionPeak {
  id: string;
  token_id: string;
  entryPrice: number;
  peakPrice: number;
  quantity: number;
  open: boolean;
}

async function updatePositionPeaks(admin: SupabaseClient, tokens: TokenRow[], now: Date) {
  const prices = new Map(tokens.map((t) => [t.id, toNum(t.price_usd)]));
  const out = new Map<string, PositionPeak>();
  const { data } = await admin
    .from("positions")
    .select("id, token_id, entry_price, invested_usd, peak_price, exit_price")
    .is("exit_price", null)
    .in("token_id", [...prices.keys()]);
  for (const p of data ?? []) {
    const price = prices.get(p.token_id);
    const entry = Number(p.entry_price);
    const prevPeak = toNum(p.peak_price) ?? entry;
    const peak = price != null ? Math.max(prevPeak, price) : prevPeak;
    if (peak > prevPeak || p.peak_price == null) {
      await admin.from("positions").update({ peak_price: peak, peak_at: now.toISOString() }).eq("id", p.id);
    }
    out.set(p.id, { id: p.id, token_id: p.token_id, entryPrice: entry, peakPrice: peak, quantity: Number(p.invested_usd) / entry, open: true });
  }
  return out;
}

async function evaluateRulesFor(
  admin: SupabaseClient,
  tokens: TokenRow[],
  contexts: Map<string, MarketContext>,
  positions: Map<string, PositionPeak>,
  now: Date,
): Promise<number> {
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const { data: rules, error } = await admin
    .from("alert_rules")
    .select("id, user_id, token_id, type, params, armed, state, version, cooldown_minutes, last_triggered_at, position_id")
    .eq("enabled", true)
    .in("token_id", [...byId.keys()]);
  if (error) throw error;

  let fired = 0;
  for (const rule of (rules ?? []) as RuleRow[]) {
    const token = byId.get(rule.token_id)!;
    const pos = rule.position_id ? positions.get(rule.position_id) : undefined;
    // Position rules only make sense while the position is open.
    if (rule.position_id && !pos) continue;
    const market: MarketData = {
      ...rowToMarket(token),
      context: { ...contexts.get(token.id), ...(pos ? { position: { entryPrice: pos.entryPrice, peakPrice: pos.peakPrice, quantity: pos.quantity } } : {}) },
    };
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
  event: { title: string; message: string; metrics: Record<string, unknown>; severity: Severity; explanation: AlertExplanation },
  now: Date,
) {
  const symbol = token.symbol ?? "Token";
  const { data: profile } = await admin.from("profiles").select("plan").eq("id", rule.user_id).maybeSingle();
  const plan = getPlan(profile?.plan);
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
      severity: event.severity,
      explanation: event.explanation,
      created_at: now.toISOString(),
    })
    .select("id")
    .single();
  if (error || !ev) {
    console.error("[alerts] insert event failed", error);
    return;
  }

  // Paper Exit: link to the position the rule watches, or the user's open position on this token.
  if (market.priceUsd != null) {
    let q = admin
      .from("positions")
      .select("id, entry_price, invested_usd")
      .eq("user_id", rule.user_id)
      .eq("token_id", token.id)
      .is("exit_price", null);
    if (rule.position_id) q = q.eq("id", rule.position_id);
    const { data: pos } = await q.order("entry_at", { ascending: false }).limit(1).maybeSingle();
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
    body: event.explanation.what ? `${event.explanation.what} ${event.explanation.why}` : event.message,
    url: `/alerts?tab=history`,
    tag: `rule-${rule.id}`,
    urgency: plan.priorityAlerts || event.severity === "critical" ? "high" : "normal",
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
