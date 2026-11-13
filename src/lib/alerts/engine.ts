/**
 * Alert engine — pure functions, no I/O. Easy to unit test.
 *
 * Every rule is EDGE-TRIGGERED to avoid spamming the same alert:
 *   1. A rule only fires while `armed`.
 *   2. After firing it is disarmed.
 *   3. It re-arms when its condition clears (with hysteresis for score-based rules),
 *      or — for peak-based rules (drawdown, trailing stop, giveback) — when a NEW peak is made.
 *   4. On top of that, a cooldown prevents firing again too soon after re-arming.
 *
 * Each alert carries a plain-language explanation (in the user's language): what is happening,
 * why it fired, which indicators changed, what risk it represents and what to watch next.
 * Wording never states that a price WILL fall or that the user MUST sell.
 */
import { formatPct, formatPrice, formatUsdCompact } from "../format";
import type { Locale } from "../i18n";
import {
  PARAM_SCHEMAS,
  type AlertExplanation,
  type AlertType,
  type EvaluationResult,
  type MarketData,
  type RuleRuntime,
  type Severity,
} from "./types";

/** Never evaluate on data older than this — we'd rather stay silent than alert on stale data. */
export const MAX_DATA_AGE_MS = 10 * 60 * 1000;

/** Rule types that re-arm on a new peak rather than when the condition clears. */
const PEAK_REARM: AlertType[] = ["drawdown_from_peak", "trailing_stop", "profit_giveback"];

export function parseParams(type: AlertType, params: unknown) {
  return PARAM_SCHEMAS[type].safeParse(params);
}

interface ConditionResult {
  met: boolean;
  state: Record<string, unknown>;
  /** Peak rules: price made a new high above the last trigger peak. */
  rearm?: boolean;
  /** Condition must drop below this to re-arm (hysteresis) — overrides `!met`. */
  clear?: boolean;
  /** Do not fire this tick (crossing rule initialising). */
  hold?: boolean;
  title?: string;
  message?: string;
  metrics?: Record<string, number | string | null>;
  severity?: Severity;
  explanation?: AlertExplanation;
  skipped?: string;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function sevFromPct(v: number, steps: [number, number, number]): Severity {
  if (v >= steps[2]) return "critical";
  if (v >= steps[1]) return "high";
  if (v >= steps[0]) return "warning";
  return "info";
}

/** Shared peak tracking for peak-based rules. */
function trackPeak(state: Record<string, unknown>, price: number, armed: boolean, at: Date | null) {
  const prevPeak = num(state.peak_price);
  const triggerPeak = num(state.trigger_peak_price);
  const newHigh = prevPeak == null || price > prevPeak;
  const peak = newHigh ? price : prevPeak!;
  return {
    peak,
    rearm: !armed && triggerPeak != null && price > triggerPeak,
    state: { ...state, peak_price: peak, peak_at: newHigh ? (at ?? new Date()).toISOString() : state.peak_at } as Record<string, unknown>,
  };
}

function checkCondition(
  type: AlertType,
  rawParams: unknown,
  m: MarketData,
  state: Record<string, unknown>,
  armed: boolean,
  locale: Locale,
): ConditionResult {
  const T = (en: string, es: string) => (locale === "es" ? es : en);
  const RISK_NOTE = T(
    "This is a signal based on market data, not a prediction: the price may recover.",
    "Es una señal basada en datos de mercado, no una predicción: el precio puede recuperarse.",
  );
  const parsed = parseParams(type, rawParams);
  if (!parsed.success) return { met: false, state, skipped: "invalid_params" };
  const price = m.priceUsd;
  const ctx = m.context ?? {};

  switch (type) {
    case "drawdown_from_peak": {
      const p = parsed.data as { drop_pct: number; min_peak_market_cap?: number };
      if (price == null || price <= 0) return { met: false, state, skipped: "no_price" };
      const tp = trackPeak(state, price, armed, m.updatedAt);
      const prevPeakMcap = num(state.peak_market_cap);
      const peakMcap = m.marketCap != null ? Math.max(prevPeakMcap ?? 0, m.marketCap) : prevPeakMcap;
      const nextState = { ...tp.state, peak_market_cap: peakMcap };
      const drawdown = ((tp.peak - price) / tp.peak) * 100;
      const peakQualifies = p.min_peak_market_cap == null || (peakMcap != null && peakMcap >= p.min_peak_market_cap);
      const dd = drawdown.toFixed(1);
      return {
        met: peakQualifies && drawdown >= p.drop_pct,
        rearm: tp.rearm,
        state: nextState,
        title: T(`${dd}% drop from the high`, `Caída de ${dd}% desde el máximo`),
        message: T(
          `Price is ${formatPrice(price)}, ${dd}% below the recorded high of ${formatPrice(tp.peak)}` +
            (peakMcap != null ? ` (peak market cap ${formatUsdCompact(peakMcap)})` : "") +
            `. Your threshold: ${p.drop_pct}%.`,
          `El precio está en ${formatPrice(price)}, ${dd}% por debajo del máximo registrado de ${formatPrice(tp.peak)}` +
            (peakMcap != null ? ` (market cap máx. ${formatUsdCompact(peakMcap)})` : "") +
            `. Tu umbral: ${p.drop_pct}%.`,
        ),
        metrics: { price, peak_price: tp.peak, peak_market_cap: peakMcap, drawdown_pct: Number(drawdown.toFixed(2)) },
        severity: sevFromPct(drawdown, [10, 20, 35]),
        explanation: {
          what: T(`Price pulled back ${dd}% from the high PeakAlert recorded.`, `El precio retrocedió ${dd}% desde el máximo que PeakAlert registró.`),
          why: T(
            `You set an alert for a drop of more than ${p.drop_pct}% from the high${p.min_peak_market_cap ? `, once market cap had passed ${formatUsdCompact(p.min_peak_market_cap)}` : ""}.`,
            `Configuraste un aviso cuando la caída desde el máximo supere el ${p.drop_pct}%${p.min_peak_market_cap ? `, una vez que el market cap superara ${formatUsdCompact(p.min_peak_market_cap)}` : ""}.`,
          ),
          indicators: [
            { label: T("Current price", "Precio actual"), value: formatPrice(price) },
            { label: T("Recorded high", "Máximo registrado"), value: formatPrice(tp.peak) },
            { label: T("Drop from high", "Caída desde máx."), value: `−${dd}%`, tone: "down" },
            ...(peakMcap != null ? [{ label: T("Peak market cap", "Market cap máx."), value: formatUsdCompact(peakMcap) }] : []),
          ],
          risk: T(`Part of the gains since the high has already been given back. ${RISK_NOTE}`, `Una parte de las ganancias desde el máximo ya se ha devuelto. ${RISK_NOTE}`),
          watch: [
            T("Whether price reclaims the high or keeps making lower lows.", "Si el precio recupera el máximo o sigue marcando mínimos más bajos."),
            T("Whether volume supports the bounce or fades.", "Si el volumen acompaña el rebote o se apaga."),
            T("Your entry price and how much profit you want to protect.", "Tu precio de entrada y cuánto beneficio quieres proteger."),
          ],
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
      const label = p.window === "m5" ? "5 min" : T("1h", "1 h");
      return {
        met,
        state,
        title: T(`Sudden ${change > 0 ? "rise" : "drop"}: ${formatPct(change, 1)} in ${label}`, `${change > 0 ? "Subida" : "Caída"} brusca: ${formatPct(change, 1)} en ${label}`),
        message: T(
          `Price moved ${formatPct(change, 2)} in ${label} (threshold ±${p.change_pct}%). Current price: ${formatPrice(price)}.`,
          `El precio cambió ${formatPct(change, 2)} en ${label} (umbral ±${p.change_pct}%). Precio actual: ${formatPrice(price)}.`,
        ),
        metrics: { price, change_pct: change, window: p.window },
        severity: change < 0 ? sevFromPct(-change, [5, 12, 25]) : "info",
        explanation: {
          what: T(`Price moved ${formatPct(change, 1)} in ${label}.`, `El precio se movió ${formatPct(change, 1)} en ${label}.`),
          why: T(`Your alert watches moves of ±${p.change_pct}% in ${label}.`, `Tu alerta vigila movimientos de ±${p.change_pct}% en ${label}.`),
          indicators: [
            { label: T(`Change ${label}`, `Variación ${label}`), value: formatPct(change, 1), tone: change < 0 ? "down" : "up" },
            { label: T("Current price", "Precio actual"), value: formatPrice(price) },
          ],
          risk:
            change < 0
              ? T(`Fast drops can accelerate if other holders sell at the same time. ${RISK_NOTE}`, `Las caídas rápidas pueden acelerarse si otros holders venden a la vez. ${RISK_NOTE}`)
              : T("Vertical moves tend to be unstable and often retrace part of the move.", "Las subidas verticales suelen ser inestables y a menudo corrigen parte del movimiento."),
          watch: [
            T("Whether the move continues over the next minutes or reverses.", "Si el movimiento continúa en los próximos minutos o se revierte."),
            T("Pool liquidity: with low liquidity, moves get exaggerated.", "La liquidez del pool: con poca liquidez los movimientos se exageran."),
          ],
        },
      };
    }

    case "volume_drop": {
      const p = parsed.data as { drop_pct: number; min_avg_hourly_volume_usd: number };
      const h1 = m.volume.h1;
      const h6 = m.volume.h6;
      if (h1 == null || h6 == null) return { met: false, state, skipped: "no_volume_data" };
      const prevAvg = (h6 - h1) / 5;
      if (prevAvg < p.min_avg_hourly_volume_usd || prevAvg <= 0) return { met: false, state, skipped: "volume_too_low" };
      const dropPct = (1 - h1 / prevAvg) * 100;
      return {
        met: dropPct >= p.drop_pct,
        state,
        title: T(`Volume ${dropPct.toFixed(0)}% below its average`, `Volumen ${dropPct.toFixed(0)}% por debajo de su promedio`),
        message: T(
          `Last-hour volume: ${formatUsdCompact(h1)} vs. previous hourly average ${formatUsdCompact(prevAvg)} (−${dropPct.toFixed(1)}%). Threshold: ${p.drop_pct}%.`,
          `Volumen de la última hora: ${formatUsdCompact(h1)} vs. promedio horario previo ${formatUsdCompact(prevAvg)} (−${dropPct.toFixed(1)}%). Umbral: ${p.drop_pct}%.`,
        ),
        metrics: { volume_h1: h1, prev_avg_hourly: Number(prevAvg.toFixed(2)), drop_pct: Number(dropPct.toFixed(2)) },
        severity: sevFromPct(dropPct, [50, 70, 85]),
        explanation: {
          what: T("Trading interest is fading: far less is being traded than in previous hours.", "El interés de trading está disminuyendo: se negocia mucho menos que en las horas anteriores."),
          why: T(
            `Last-hour volume fell more than ${p.drop_pct}% vs. the hourly average of the previous 5 hours.`,
            `El volumen de la última hora cayó más del ${p.drop_pct}% respecto al promedio horario de las 5 h previas.`,
          ),
          indicators: [
            { label: T("Volume 1h", "Volumen 1 h"), value: formatUsdCompact(h1), tone: "down" },
            { label: T("Previous hourly avg", "Promedio horario previo"), value: formatUsdCompact(prevAvg) },
            { label: T("Price change 1h", "Variación precio 1 h"), value: formatPct(m.change.h1, 1), tone: (m.change.h1 ?? 0) < 0 ? "down" : "up" },
          ],
          risk: T(
            "When volume dries up after a rally, there are usually fewer buyers left to hold the price.",
            "Cuando el volumen se seca después de una subida, suele haber menos compradores para sostener el precio.",
          ),
          watch: [
            T("Whether volume picks up again (renewed interest).", "Si el volumen vuelve a crecer (interés renovado)."),
            T("Whether price starts falling on low volume.", "Si el precio empieza a caer con poco volumen."),
          ],
        },
      };
    }

    case "momentum_loss": {
      const p = parsed.data as { min_gain_h6_pct: number; drop_h1_pct: number; min_sell_buy_ratio: number };
      const h6 = m.change.h6;
      const h1 = m.change.h1;
      if (h6 == null || h1 == null || !m.txnsH1) return { met: false, state, skipped: "no_momentum_data" };
      const { buys, sells } = m.txnsH1;
      const ratio = buys > 0 ? sells / buys : sells > 0 ? Infinity : 0;
      const met = h6 >= p.min_gain_h6_pct && h1 <= -p.drop_h1_pct && ratio >= p.min_sell_buy_ratio;
      return {
        met,
        state,
        title: T("Possible loss of momentum", "Posible pérdida de momentum"),
        message: T(
          `Up ${formatPct(h6, 1)} over 6h but down ${formatPct(h1, 1)} in the last hour, with ${sells} sells vs. ${buys} buys. A heuristic signal, not a prediction.`,
          `Subió ${formatPct(h6, 1)} en 6 h pero cae ${formatPct(h1, 1)} en la última hora, con ${sells} ventas vs. ${buys} compras. Es una señal heurística, no una predicción.`,
        ),
        metrics: { change_h6: h6, change_h1: h1, buys_h1: buys, sells_h1: sells, sell_buy_ratio: Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : null },
        severity: "high",
        explanation: {
          what: T("After a strong rally, price is starting to fall and sells dominate.", "Después de una subida fuerte, el precio empieza a caer y predominan las ventas."),
          why: T(
            `Three conditions were met: rally ≥ ${p.min_gain_h6_pct}% over 6h, drop ≥ ${p.drop_h1_pct}% over 1h and at least ${p.min_sell_buy_ratio}× more sells than buys.`,
            `Se cumplieron tres condiciones: subida ≥ ${p.min_gain_h6_pct}% en 6 h, caída ≥ ${p.drop_h1_pct}% en 1 h y al menos ${p.min_sell_buy_ratio}× más ventas que compras.`,
          ),
          indicators: [
            { label: T("Change 6h", "Variación 6 h"), value: formatPct(h6, 1), tone: "up" },
            { label: T("Change 1h", "Variación 1 h"), value: formatPct(h1, 1), tone: "down" },
            { label: T("Sells / buys 1h", "Ventas / compras 1 h"), value: `${sells} / ${buys}`, tone: "warn" },
          ],
          risk: T(`It may indicate widespread profit-taking after the rally. ${RISK_NOTE}`, `Puede indicar toma de beneficios generalizada tras el rally. ${RISK_NOTE}`),
          watch: [
            T("Whether buys outnumber sells again.", "Si las compras vuelven a superar a las ventas."),
            T("Whether price loses the low of the last hour.", "Si el precio pierde el mínimo de la última hora."),
          ],
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
        return { met, hold: true, rearm: !met, state: { ...state, initialized: true }, skipped: "initializing" };
      }
      const above = p.direction === "above";
      const lvl = formatUsdCompact(p.value_usd);
      return {
        met,
        state,
        title: T(`Market cap ${above ? "broke above" : "fell below"} ${lvl}`, `Market cap ${above ? "superó" : "cayó por debajo de"} ${lvl}`),
        message: T(`Current market cap: ${formatUsdCompact(mc)}. Price: ${formatPrice(price)}.`, `Market cap actual: ${formatUsdCompact(mc)}. Precio: ${formatPrice(price)}.`),
        metrics: { market_cap: mc, threshold: p.value_usd },
        severity: above ? "info" : "high",
        explanation: {
          what: T(`Market cap ${above ? "reached" : "lost"} the ${lvl} level.`, `El market cap ${above ? "alcanzó" : "perdió"} el nivel de ${lvl}.`),
          why: T("You set this level as a reference.", "Configuraste este nivel como referencia."),
          indicators: [
            { label: T("Current market cap", "Market cap actual"), value: formatUsdCompact(mc) },
            { label: T("Level", "Nivel"), value: lvl },
            { label: T("Change 1h", "Variación 1 h"), value: formatPct(m.change.h1, 1), tone: (m.change.h1 ?? 0) < 0 ? "down" : "up" },
          ],
          risk: above
            ? T("Many traders use round market-cap levels as profit-taking targets.", "Muchos traders usan los niveles redondos de market cap como objetivos de toma de beneficios.")
            : T(`Losing a key level can accelerate selling. ${RISK_NOTE}`, `Perder un nivel importante puede acelerar las ventas. ${RISK_NOTE}`),
          watch: [
            T("Whether market cap holds on the new side of the level or crosses back.", "Si el market cap se mantiene del nuevo lado del nivel o vuelve a cruzarlo."),
            T("The exhaustion risk score.", "La puntuación de riesgo de agotamiento."),
          ],
        },
      };
    }

    case "exhaustion_risk": {
      const p = parsed.data as { min_score: number; min_coverage: number };
      const r = ctx.risk;
      if (!r) return { met: false, state, skipped: "no_risk_data" };
      if (r.coverage < p.min_coverage) return { met: false, state, skipped: "low_coverage" };
      const top = r.factors.filter((f) => f.available && f.score >= 50).sort((a, b) => b.score - a.score);
      const summary = locale === "es" ? r.summary.es : r.summary.en;
      return {
        met: r.score >= p.min_score,
        // Hysteresis: re-arm only once the score is clearly below the threshold.
        clear: r.score < p.min_score - 10,
        state,
        title: T(`Exhaustion risk ${r.score}/100`, `Riesgo de agotamiento ${r.score}/100`),
        message: T(
          `The Peak Detection score reached ${r.score} (threshold ${p.min_score}). ${summary}`,
          `La puntuación de Peak Detection llegó a ${r.score} (umbral ${p.min_score}). ${summary}`,
        ),
        metrics: { risk_score: r.score, coverage: Number(r.coverage.toFixed(2)) },
        severity: r.score >= 81 ? "critical" : r.score >= 61 ? "high" : "warning",
        explanation: {
          what: T("Several indicators show typical signs of an exhausted rally.", "Varios indicadores muestran señales típicas de agotamiento del impulso alcista."),
          why: T(`The risk score (${r.score}/100) went above your threshold of ${p.min_score}.`, `La puntuación de riesgo (${r.score}/100) superó tu umbral de ${p.min_score}.`),
          indicators: (top.length ? top : r.factors.filter((f) => f.available)).slice(0, 5).map((f) => ({
            label: locale === "es" ? f.label.es : f.label.en,
            value: `${(f.value && (locale === "es" ? f.value.es : f.value.en)) || "—"} · ${f.score}/100`,
            tone: f.score >= 70 ? ("down" as const) : f.score >= 40 ? ("warn" as const) : ("neutral" as const),
          })),
          risk: T(
            `The score summarizes observed signals; it is not the probability that price will fall. ${RISK_NOTE}`,
            `La puntuación resume señales observadas; no es la probabilidad de que el precio caiga. ${RISK_NOTE}`,
          ),
          watch: [
            T("Which factors keep rising in the token's detail view.", "Qué factores siguen subiendo en el detalle del token."),
            T("Whether the score drops again (momentum recovering).", "Si la puntuación baja de nuevo (el impulso se recupera)."),
            T("Your trailing stop level if you hold a position.", "Tu nivel de trailing stop si tienes una posición."),
          ],
        },
      };
    }

    case "liquidity_drop": {
      const p = parsed.data as { window: "1h" | "6h"; drop_pct: number };
      const ch = ctx.liquidityChange?.[p.window];
      if (ch == null) return { met: false, state, skipped: "no_liquidity_history" };
      const drop = -ch;
      const liq = formatUsdCompact(m.liquidityUsd ?? null);
      return {
        met: drop >= p.drop_pct,
        state,
        title: T(`Liquidity −${drop.toFixed(1)}% in ${p.window}`, `Liquidez −${drop.toFixed(1)}% en ${p.window}`),
        message: T(
          `Pool liquidity dropped ${drop.toFixed(1)}% in ${p.window} (threshold ${p.drop_pct}%). Current liquidity: ${liq}.`,
          `La liquidez del pool bajó ${drop.toFixed(1)}% en ${p.window} (umbral ${p.drop_pct}%). Liquidez actual: ${liq}.`,
        ),
        metrics: { liquidity_change_pct: Number(ch.toFixed(2)), liquidity_usd: m.liquidityUsd ?? null },
        severity: sevFromPct(drop, [10, 20, 40]),
        explanation: {
          what: T("A significant share of the trading pool's liquidity was removed.", "Se retiró una parte relevante de la liquidez del pool de trading."),
          why: T(`Liquidity fell more than ${p.drop_pct}% in ${p.window}.`, `La liquidez cayó más del ${p.drop_pct}% en ${p.window}.`),
          indicators: [
            { label: T(`Liquidity ${p.window}`, `Liquidez ${p.window}`), value: `−${drop.toFixed(1)}%`, tone: "down" },
            { label: T("Current liquidity", "Liquidez actual"), value: liq },
            { label: T("Price change 1h", "Variación precio 1 h"), value: formatPct(m.change.h1, 1), tone: (m.change.h1 ?? 0) < 0 ? "down" : "up" },
          ],
          risk: T(
            "With less liquidity, every sell moves the price more and exiting costs more (slippage). Large, sudden withdrawals deserve attention.",
            "Con menos liquidez, cada venta mueve más el precio y salir de la posición sale más caro (slippage). Retiros grandes y repentinos merecen atención.",
          ),
          watch: [
            T("Whether liquidity keeps falling.", "Si la liquidez sigue bajando."),
            T("Activity of the liquidity-provider wallets (in a block explorer).", "Movimientos de los wallets que aportan liquidez (en un explorador de bloques)."),
            T("Estimated slippage before trading.", "El slippage estimado antes de operar."),
          ],
        },
      };
    }

    case "trend_break": {
      const p = parsed.data as { below_avg_pct: number; min_gain_h6_pct: number };
      const avg = ctx.avgPrice1h;
      if (avg == null || price == null) return { met: false, state, skipped: "no_trend_history" };
      const h6 = m.change.h6;
      if (p.min_gain_h6_pct > 0 && h6 == null) return { met: false, state, skipped: "no_change_data" };
      const below = ((avg - price) / avg) * 100;
      const uptrend = p.min_gain_h6_pct === 0 || (h6 ?? 0) >= p.min_gain_h6_pct;
      return {
        met: uptrend && below >= p.below_avg_pct,
        state,
        title: T("Possible trend break", "Posible ruptura de tendencia"),
        message: T(
          `Price (${formatPrice(price)}) is ${below.toFixed(1)}% below its 1h average (${formatPrice(avg)}) after rising ${formatPct(h6, 1)} over 6h.`,
          `El precio (${formatPrice(price)}) está ${below.toFixed(1)}% por debajo de su media de 1 h (${formatPrice(avg)}) tras subir ${formatPct(h6, 1)} en 6 h.`,
        ),
        metrics: { price, avg_price_1h: avg, below_avg_pct: Number(below.toFixed(2)), change_h6: h6 },
        severity: sevFromPct(below, [3, 8, 15]),
        explanation: {
          what: T("Price broke below its recent average after an uptrend.", "El precio rompió a la baja su zona media reciente después de una tendencia alcista."),
          why: T(
            `It fell more than ${p.below_avg_pct}% below the last hour's average price${p.min_gain_h6_pct > 0 ? ` after rising at least ${p.min_gain_h6_pct}% over 6h` : ""}.`,
            `Cayó más de ${p.below_avg_pct}% por debajo del precio medio de la última hora${p.min_gain_h6_pct > 0 ? ` tras subir al menos ${p.min_gain_h6_pct}% en 6 h` : ""}.`,
          ),
          indicators: [
            { label: T("Current price", "Precio actual"), value: formatPrice(price) },
            { label: T("1h average", "Media 1 h"), value: formatPrice(avg) },
            { label: T("Below average", "Bajo la media"), value: `−${below.toFixed(1)}%`, tone: "down" },
            { label: T("Change 6h", "Variación 6 h"), value: formatPct(h6, 1), tone: "up" },
          ],
          risk: T(`Losing the recent average is one of the first signs of a trend change. ${RISK_NOTE}`, `Perder la media reciente es una de las primeras señales de cambio de tendencia. ${RISK_NOTE}`),
          watch: [
            T("Whether price quickly reclaims the average (false break).", "Si el precio recupera rápidamente la media (falsa ruptura)."),
            T("Whether lower lows appear with rising volume.", "Si aparecen mínimos más bajos con volumen creciente."),
          ],
        },
      };
    }

    case "trailing_stop": {
      const p = parsed.data as { trail_pct: number; only_in_profit: boolean };
      const pos = ctx.position;
      if (!pos || price == null) return { met: false, state, skipped: "no_position" };
      const peak = Math.max(pos.peakPrice, price);
      const triggerPeak = num(state.trigger_peak_price);
      const fromPeak = ((peak - price) / peak) * 100;
      const stopPrice = peak * (1 - p.trail_pct / 100);
      const inProfit = price > pos.entryPrice;
      const roi = (price / pos.entryPrice - 1) * 100;
      return {
        met: fromPeak >= p.trail_pct && (!p.only_in_profit || inProfit),
        rearm: !armed && triggerPeak != null && peak > triggerPeak,
        state: { ...state, peak_price: peak },
        title: T(`${p.trail_pct}% trailing stop hit`, `Trailing stop ${p.trail_pct}% alcanzado`),
        message: T(
          `Price (${formatPrice(price)}) is down ${fromPeak.toFixed(1)}% from the high since your entry (${formatPrice(peak)}). Stop level: ${formatPrice(stopPrice)}. Current ROI: ${formatPct(roi, 1)}.`,
          `El precio (${formatPrice(price)}) cayó ${fromPeak.toFixed(1)}% desde el máximo desde tu entrada (${formatPrice(peak)}). Nivel de stop: ${formatPrice(stopPrice)}. ROI actual: ${formatPct(roi, 1)}.`,
        ),
        metrics: { price, peak_price: peak, stop_price: stopPrice, roi_pct: Number(roi.toFixed(2)) },
        severity: inProfit ? "high" : "critical",
        explanation: {
          what: T(
            `Your position pulled back ${fromPeak.toFixed(1)}% from the best price reached since you bought.`,
            `Tu posición retrocedió ${fromPeak.toFixed(1)}% desde el mejor precio alcanzado desde tu compra.`,
          ),
          why: T(`You set a ${p.trail_pct}% trailing stop for this position.`, `Configuraste un trailing stop del ${p.trail_pct}% para esta posición.`),
          indicators: [
            { label: T("Entry price", "Precio de entrada"), value: formatPrice(pos.entryPrice) },
            { label: T("High since entry", "Máximo desde entrada"), value: formatPrice(peak) },
            { label: T("Current price", "Precio actual"), value: formatPrice(price), tone: "down" },
            { label: T("Current ROI", "ROI actual"), value: formatPct(roi, 1), tone: roi >= 0 ? "up" : "down" },
          ],
          risk: inProfit
            ? T(
                `You're still in profit (${formatPct(roi, 1)}), but you've given back part of your gains. PeakAlert does not sell for you.`,
                `Sigues en beneficio (${formatPct(roi, 1)}), pero has devuelto parte de lo ganado. PeakAlert no vende por ti.`,
              )
            : T("The position is already below your entry price.", "La posición ya está por debajo de tu precio de entrada."),
          watch: [
            T("Whether to take profit fully or partially according to your plan.", "Si decides tomar beneficios total o parcialmente según tu plan."),
            T("Whether price reclaims the high (the trailing stop re-arms automatically).", "Si el precio recupera el máximo (el trailing se rearma automáticamente)."),
          ],
        },
      };
    }

    case "profit_giveback": {
      const p = parsed.data as { giveback_pct: number; min_profit_pct: number };
      const pos = ctx.position;
      if (!pos || price == null) return { met: false, state, skipped: "no_position" };
      const peak = Math.max(pos.peakPrice, price);
      const triggerPeak = num(state.trigger_peak_price);
      const maxProfitPct = (peak / pos.entryPrice - 1) * 100;
      const maxProfit = (peak - pos.entryPrice) * pos.quantity;
      const curProfit = (price - pos.entryPrice) * pos.quantity;
      const giveback = maxProfit > 0 ? ((maxProfit - curProfit) / maxProfit) * 100 : 0;
      return {
        met: maxProfitPct >= p.min_profit_pct && giveback >= p.giveback_pct,
        rearm: !armed && triggerPeak != null && peak > triggerPeak,
        state: { ...state, peak_price: peak },
        title: T(`You've given back ${giveback.toFixed(0)}% of your max profit`, `Has devuelto ${giveback.toFixed(0)}% del beneficio máximo`),
        message: T(
          `Max unrealized profit: $${maxProfit.toFixed(2)} (${formatPct(maxProfitPct, 0)}). Current estimated profit: $${curProfit.toFixed(2)}.`,
          `Beneficio máximo no realizado: $${maxProfit.toFixed(2)} (${formatPct(maxProfitPct, 0)}). Beneficio actual estimado: $${curProfit.toFixed(2)}.`,
        ),
        metrics: { max_profit_usd: Number(maxProfit.toFixed(2)), current_profit_usd: Number(curProfit.toFixed(2)), giveback_pct: Number(giveback.toFixed(2)) },
        severity: giveback >= 75 ? "critical" : "high",
        explanation: {
          what: T(`${giveback.toFixed(0)}% of your best unrealized profit has already been given back.`, `De tu mejor beneficio no realizado ya se ha devuelto el ${giveback.toFixed(0)}%.`),
          why: T(
            `You set an alert for giving back ${p.giveback_pct}% of profit, once the position was up +${p.min_profit_pct}%.`,
            `Configuraste un aviso al devolver el ${p.giveback_pct}% del beneficio, una vez superado +${p.min_profit_pct}%.`,
          ),
          indicators: [
            { label: T("Max profit", "Beneficio máximo"), value: `$${maxProfit.toFixed(2)} (${formatPct(maxProfitPct, 0)})`, tone: "up" },
            { label: T("Current profit", "Beneficio actual"), value: `$${curProfit.toFixed(2)}`, tone: curProfit >= 0 ? "up" : "down" },
            { label: T("Given back", "Devuelto"), value: `${giveback.toFixed(0)}%`, tone: "down" },
          ],
          risk: T(
            "This is exactly what PeakAlert aims to prevent: big gains slipping away while waiting for more upside.",
            "Es exactamente la situación que PeakAlert busca evitar: ganancias importantes que se van perdiendo mientras se espera más subida.",
          ),
          watch: [
            T("How much profit you want to lock in according to your plan.", "Cuánto beneficio quieres asegurar según tu plan."),
            T("The token's exhaustion risk score.", "La puntuación de riesgo de agotamiento del token."),
          ],
        },
      };
    }
  }
}

export function evaluateRule(rule: RuleRuntime, market: MarketData, now: Date = new Date(), locale: Locale = "en"): EvaluationResult {
  if (!market.updatedAt || now.getTime() - market.updatedAt.getTime() > MAX_DATA_AGE_MS) {
    return { fire: false, armed: rule.armed, state: rule.state, skipped: "stale_data" };
  }

  const c = checkCondition(rule.type, rule.params, market, rule.state, rule.armed, locale);
  if (c.skipped && c.skipped !== "initializing") {
    return { fire: false, armed: rule.armed, state: c.state, skipped: c.skipped };
  }
  if (c.hold) {
    return { fire: false, armed: c.rearm ?? rule.armed, state: c.state, skipped: c.skipped };
  }

  const peakRule = PEAK_REARM.includes(rule.type);
  let armed = rule.armed;
  if (!armed) {
    if (peakRule) armed = Boolean(c.rearm);
    else armed = c.clear !== undefined ? c.clear : !c.met;
  }

  let state = c.state;
  if (armed && !rule.armed && peakRule) state = { ...state, trigger_peak_price: null };

  if (!armed || !c.met) return { fire: false, armed, state };

  const cooldownMs = rule.cooldownMinutes * 60 * 1000;
  if (rule.lastTriggeredAt && now.getTime() - rule.lastTriggeredAt.getTime() < cooldownMs) {
    return { fire: false, armed, state, skipped: "cooldown" };
  }

  if (peakRule) state = { ...state, trigger_peak_price: state.peak_price };

  return {
    fire: true,
    armed: false,
    state,
    event: {
      title: c.title ?? "Alert",
      message: c.message ?? "",
      metrics: c.metrics ?? {},
      severity: c.severity ?? "warning",
      explanation: c.explanation ?? { what: c.message ?? "", why: "", indicators: [], risk: "", watch: [] },
    },
  };
}
