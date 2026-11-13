/**
 * Alert engine — pure functions, no I/O. Easy to unit test.
 *
 * Every rule is EDGE-TRIGGERED to avoid spamming the same alert:
 *   1. A rule only fires while `armed`.
 *   2. After firing it is disarmed.
 *   3. It re-arms when its condition clears (or, for drawdown, when a NEW peak is made).
 *   4. On top of that, a cooldown prevents firing again too soon after re-arming.
 */
import { formatPct, formatPrice, formatUsdCompact } from "../format";
import {
  PARAM_SCHEMAS,
  type AlertType,
  type EvaluationResult,
  type MarketData,
  type RuleRuntime,
} from "./types";

/** Never evaluate on data older than this — we'd rather stay silent than alert on stale data. */
export const MAX_DATA_AGE_MS = 10 * 60 * 1000;

export function parseParams(type: AlertType, params: unknown) {
  return PARAM_SCHEMAS[type].safeParse(params);
}

interface ConditionResult {
  met: boolean;
  /** For rules that track state (peak, crossing init). */
  state: Record<string, unknown>;
  /** Force re-arm even if `met` (drawdown: new peak). */
  rearm?: boolean;
  /** Do not fire this tick (e.g. crossing rule initialising). */
  hold?: boolean;
  title?: string;
  message?: string;
  metrics?: Record<string, number | string | null>;
  skipped?: string;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function checkCondition(
  type: AlertType,
  rawParams: unknown,
  m: MarketData,
  state: Record<string, unknown>,
  armed: boolean,
): ConditionResult {
  const parsed = parseParams(type, rawParams);
  if (!parsed.success) return { met: false, state, skipped: "invalid_params" };
  const price = m.priceUsd;

  switch (type) {
    case "drawdown_from_peak": {
      const p = parsed.data as { drop_pct: number; min_peak_market_cap?: number };
      if (price == null || price <= 0) return { met: false, state, skipped: "no_price" };
      const prevPeak = num(state.peak_price);
      const prevPeakMcap = num(state.peak_market_cap);
      const triggerPeak = num(state.trigger_peak_price);
      const newHigh = prevPeak == null || price > prevPeak;

      const peak = newHigh ? price : prevPeak!;
      const peakMcap =
        m.marketCap != null ? Math.max(prevPeakMcap ?? 0, m.marketCap) : prevPeakMcap;

      const nextState: Record<string, unknown> = {
        ...state,
        peak_price: peak,
        peak_market_cap: peakMcap,
        peak_at: newHigh ? (m.updatedAt ?? new Date()).toISOString() : state.peak_at,
      };

      // Re-arm when the price makes a new high above the peak of the last trigger.
      const rearm = !armed && triggerPeak != null && price > triggerPeak;

      const drawdown = ((peak - price) / peak) * 100;
      const peakQualifies =
        p.min_peak_market_cap == null || (peakMcap != null && peakMcap >= p.min_peak_market_cap);
      const met = peakQualifies && drawdown >= p.drop_pct;

      return {
        met,
        rearm,
        state: nextState,
        title: `Caída de ${drawdown.toFixed(1)}% desde el máximo`,
        message:
          `El precio está en ${formatPrice(price)}, ${drawdown.toFixed(1)}% por debajo del máximo registrado ` +
          `de ${formatPrice(peak)}` +
          (peakMcap != null ? ` (market cap máx. ${formatUsdCompact(peakMcap)})` : "") +
          `. Tu umbral: ${p.drop_pct}%.`,
        metrics: {
          price,
          peak_price: peak,
          peak_market_cap: peakMcap,
          drawdown_pct: Number(drawdown.toFixed(2)),
        },
      };
    }

    case "price_spike": {
      const p = parsed.data as { window: "m5" | "h1"; direction: "up" | "down" | "both"; change_pct: number };
      const change = m.change[p.window];
      if (change == null) return { met: false, state, skipped: "no_change_data" };
      const up = change >= p.change_pct;
      const down = change <= -p.change_pct;
      const met = p.direction === "up" ? up : p.direction === "down" ? down : up || down;
      const label = p.window === "m5" ? "5 min" : "1 h";
      return {
        met,
        state,
        title: `${change > 0 ? "Subida" : "Caída"} brusca: ${formatPct(change, 1)} en ${label}`,
        message: `El precio cambió ${formatPct(change, 2)} en ${label} (umbral ±${p.change_pct}%). Precio actual: ${formatPrice(price)}.`,
        metrics: { price, change_pct: change, window: p.window },
      };
    }

    case "volume_drop": {
      const p = parsed.data as { drop_pct: number; min_avg_hourly_volume_usd: number };
      const h1 = m.volume.h1;
      const h6 = m.volume.h6;
      if (h1 == null || h6 == null) return { met: false, state, skipped: "no_volume_data" };
      const prevAvg = (h6 - h1) / 5;
      if (prevAvg < p.min_avg_hourly_volume_usd || prevAvg <= 0)
        return { met: false, state, skipped: "volume_too_low" };
      const dropPct = (1 - h1 / prevAvg) * 100;
      return {
        met: dropPct >= p.drop_pct,
        state,
        title: `Volumen ${dropPct.toFixed(0)}% por debajo de su promedio`,
        message:
          `Volumen de la última hora: ${formatUsdCompact(h1)} vs. promedio horario previo ` +
          `${formatUsdCompact(prevAvg)} (−${dropPct.toFixed(1)}%). Umbral: ${p.drop_pct}%.`,
        metrics: { volume_h1: h1, prev_avg_hourly: Number(prevAvg.toFixed(2)), drop_pct: Number(dropPct.toFixed(2)) },
      };
    }

    case "momentum_loss": {
      const p = parsed.data as { min_gain_h6_pct: number; drop_h1_pct: number; min_sell_buy_ratio: number };
      const h6 = m.change.h6;
      const h1 = m.change.h1;
      if (h6 == null || h1 == null || !m.txnsH1)
        return { met: false, state, skipped: "no_momentum_data" };
      const { buys, sells } = m.txnsH1;
      const ratio = buys > 0 ? sells / buys : sells > 0 ? Infinity : 0;
      const met = h6 >= p.min_gain_h6_pct && h1 <= -p.drop_h1_pct && ratio >= p.min_sell_buy_ratio;
      return {
        met,
        state,
        title: "Posible pérdida de momentum",
        message:
          `Subió ${formatPct(h6, 1)} en 6 h pero cae ${formatPct(h1, 1)} en la última hora, ` +
          `con ${sells} ventas vs. ${buys} compras. Es una señal heurística, no una predicción.`,
        metrics: {
          change_h6: h6,
          change_h1: h1,
          buys_h1: buys,
          sells_h1: sells,
          sell_buy_ratio: Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : null,
        },
      };
    }

    case "market_cap_cross": {
      const p = parsed.data as { direction: "above" | "below"; value_usd: number };
      const mc = m.marketCap;
      if (mc == null) return { met: false, state, skipped: "no_market_cap" };
      const met = p.direction === "above" ? mc >= p.value_usd : mc <= p.value_usd;
      // First evaluation: just record which side we're on. A cross needs a "before".
      if (state.initialized !== true) {
        return {
          met,
          hold: true,
          rearm: !met,
          state: { ...state, initialized: true },
          skipped: "initializing",
        };
      }
      return {
        met,
        state,
        title: `Market cap ${p.direction === "above" ? "superó" : "cayó por debajo de"} ${formatUsdCompact(p.value_usd)}`,
        message: `Market cap actual: ${formatUsdCompact(mc)}. Precio: ${formatPrice(price)}.`,
        metrics: { market_cap: mc, threshold: p.value_usd },
      };
    }
  }
}

export function evaluateRule(
  rule: RuleRuntime,
  market: MarketData,
  now: Date = new Date(),
): EvaluationResult {
  if (!market.updatedAt || now.getTime() - market.updatedAt.getTime() > MAX_DATA_AGE_MS) {
    return { fire: false, armed: rule.armed, state: rule.state, skipped: "stale_data" };
  }

  const c = checkCondition(rule.type, rule.params, market, rule.state, rule.armed);
  if (c.skipped && c.skipped !== "initializing") {
    return { fire: false, armed: rule.armed, state: c.state, skipped: c.skipped };
  }

  if (c.hold) {
    // Crossing rules: start armed only if we're on the "before" side.
    return { fire: false, armed: c.rearm ?? rule.armed, state: c.state, skipped: c.skipped };
  }

  let armed = rule.armed;
  if (!armed) {
    // Generic re-arm: condition cleared. Drawdown re-arms only on a new peak.
    if (rule.type === "drawdown_from_peak") {
      if (c.rearm) armed = true;
    } else if (!c.met) {
      armed = true;
    }
  }

  let state = c.state;
  if (armed && !rule.armed && rule.type === "drawdown_from_peak") {
    // New cycle: the peak restarts from the current (new high) price.
    state = { ...state, trigger_peak_price: null };
  }

  if (!armed || !c.met) {
    return { fire: false, armed, state };
  }

  const cooldownMs = rule.cooldownMinutes * 60 * 1000;
  if (rule.lastTriggeredAt && now.getTime() - rule.lastTriggeredAt.getTime() < cooldownMs) {
    return { fire: false, armed, state, skipped: "cooldown" };
  }

  if (rule.type === "drawdown_from_peak") {
    state = { ...state, trigger_peak_price: state.peak_price };
  }

  return {
    fire: true,
    armed: false,
    state,
    event: { title: c.title ?? "Alerta", message: c.message ?? "", metrics: c.metrics ?? {} },
  };
}
