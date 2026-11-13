import { L, type L10n } from "../i18n";

/**
 * Peak Detection — momentum-exhaustion risk score (0–100).
 *
 * This is a TRANSPARENT HEURISTIC, not a trained AI model and not a probability.
 * It combines market signals that traders commonly watch near local tops. Every
 * factor is reported with its own score and a plain-language explanation, and
 * factors without enough data are excluded (and reported) instead of guessed.
 *
 * Pure functions — no I/O.
 */

export interface SeriesPoint {
  t: number; // ms
  price: number;
  liquidity: number | null;
  marketCap: number | null;
}

export interface RiskMarket {
  priceUsd: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volume: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  change: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  txnsM5: { buys: number; sells: number } | null;
  txnsH1: { buys: number; sells: number } | null;
}

export type RiskLevel = "healthy" | "caution" | "elevated" | "very_high";

export interface RiskFactor {
  key: FactorKey;
  label: L10n;
  weight: number;
  available: boolean;
  score: number; // 0..100 (0 when unavailable)
  value: L10n | null; // short formatted metric
  detail: L10n; // plain-language explanation
}

export interface RiskResult {
  score: number; // 0..100
  level: RiskLevel;
  coverage: number; // 0..1 share of weight with data
  factors: RiskFactor[];
  summary: L10n;
}

export type FactorKey =
  | "run_up"
  | "momentum_decay"
  | "volume_decline"
  | "sell_pressure"
  | "drawdown"
  | "peak_rejections"
  | "liquidity_drop"
  | "volatility_shock";

export const FACTOR_WEIGHTS: Record<FactorKey, number> = {
  momentum_decay: 20,
  volume_decline: 15,
  sell_pressure: 15,
  drawdown: 15,
  run_up: 10,
  peak_rejections: 10,
  liquidity_drop: 10,
  volatility_shock: 5,
};

export const LEVELS: Record<RiskLevel, { label: L10n; range: string; tone: "up" | "warn" | "orange" | "down" }> = {
  healthy: { label: L("Healthy momentum", "Momentum saludable"), range: "0–30", tone: "up" },
  caution: { label: L("Caution", "Precaución"), range: "31–60", tone: "warn" },
  elevated: { label: L("Elevated risk", "Riesgo elevado"), range: "61–80", tone: "orange" },
  very_high: { label: L("Very high risk", "Riesgo muy elevado"), range: "81–100", tone: "down" },
};

export const FACTOR_LABELS: Record<FactorKey, L10n> = {
  run_up: L("Prior run-up", "Subida previa"),
  momentum_decay: L("Momentum loss", "Pérdida de momentum"),
  volume_decline: L("Volume decline", "Caída del volumen"),
  sell_pressure: L("Sell pressure", "Presión de venta"),
  drawdown: L("Drop from recent high", "Caída desde el máximo reciente"),
  peak_rejections: L("Rejections at the high", "Rechazos del máximo"),
  liquidity_drop: L("Liquidity drop", "Caída de liquidez"),
  volatility_shock: L("Abrupt move", "Movimiento brusco"),
};

export function levelFor(score: number): RiskLevel {
  if (score <= 30) return "healthy";
  if (score <= 60) return "caution";
  if (score <= 80) return "elevated";
  return "very_high";
}

/** Piecewise-linear interpolation through [x, y] points (x ascending). Clamped. */
export function ramp(x: number, pts: Array<[number, number]>): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x0, y0] = pts[i - 1];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return pts[pts.length - 1][1];
}

const pct = (v: number, d = 1) => `${v > 0 ? "+" : ""}${v.toFixed(d)}%`;
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function factor(key: FactorKey, partial: Omit<RiskFactor, "key" | "label" | "weight">): RiskFactor {
  return { key, label: FACTOR_LABELS[key], weight: FACTOR_WEIGHTS[key], ...partial, score: partial.available ? clamp(partial.score) : 0 };
}

const NA = (key: FactorKey, why: L10n) => factor(key, { available: false, score: 0, value: null, detail: why });
/** Same text in both languages (numbers only). */
const same = (v: string): L10n => ({ en: v, es: v });

/** Average hourly volume of the 5 hours before the last one. */
export function prevHourlyAvg(h1: number | null, h6: number | null): number | null {
  if (h1 == null || h6 == null) return null;
  const avg = (h6 - h1) / 5;
  return avg > 0 ? avg : null;
}

/** Count separate approaches to the series high (within `tol`) separated by dips of at least `dip`. */
export function countPeakTouches(prices: number[], tol = 0.03, dip = 0.04): number {
  if (prices.length < 10) return 0;
  const max = Math.max(...prices);
  const near = max * (1 - tol);
  const reset = max * (1 - dip);
  let touches = 0;
  let armed = true;
  for (const p of prices) {
    if (armed && p >= near) {
      touches++;
      armed = false;
    } else if (!armed && p <= reset) {
      armed = true;
    }
  }
  return touches;
}

export function computeRisk(m: RiskMarket, series: SeriesPoint[] = [], now = Date.now()): RiskResult {
  const price = m.priceUsd;
  const factors: RiskFactor[] = [];

  // 1. Previous run-up: exhaustion is only a concern after a strong rally.
  {
    const { h6, h24 } = m.change;
    if (h6 == null && h24 == null) factors.push(NA("run_up", L("No 6h / 24h change data.", "Sin datos de variación 6 h / 24 h.")));
    else {
      const s = Math.max(h6 != null ? ramp(h6 * 1.5, [[0, 0], [50, 40], [150, 70], [400, 90]]) : 0, h24 != null ? ramp(h24, [[0, 0], [50, 35], [150, 65], [400, 90]]) : 0);
      factors.push(
        factor("run_up", {
          available: true,
          score: s,
          value: same(`6h ${h6 != null ? pct(h6, 0) : "—"} · 24h ${h24 != null ? pct(h24, 0) : "—"}`),
          detail:
            s >= 50
              ? L("The token is coming off a strong rally. Pullbacks after rallies like this are common.", "El token viene de una subida fuerte. Tras rallies así, los retrocesos son frecuentes.")
              : L("No extreme prior rally, so there's less to exhaust.", "No hay una subida previa extrema; el contexto de agotamiento es menor."),
        }),
      );
    }
  }

  // 2. Momentum decay: last hour vs the 6h pace.
  {
    const { h1, h6, m5 } = m.change;
    if (h1 == null || h6 == null) factors.push(NA("momentum_decay", L("No 1h / 6h change data.", "Sin datos de variación 1 h / 6 h.")));
    else {
      const pace = h6 / 6; // average % per hour over 6h
      let s: number;
      let detail: L10n;
      if (h6 > 2) {
        // Was rising: how much slower (or negative) is the last hour?
        const decay = pace > 0 ? (pace - h1) / pace : 0; // 0 = same pace, 1 = flat, >1 = falling
        s = ramp(decay, [[0, 0], [0.5, 25], [1, 50], [2, 75], [4, 95]]);
        detail =
          h1 < 0
            ? L(`It was rising ${pct(pace)} per hour on average, but the last hour is ${pct(h1)}.`, `Subía a un ritmo medio de ${pct(pace)} por hora, pero la última hora cae ${pct(h1)}.`)
            : h1 < pace
              ? L(`The rally is slowing: ${pct(h1)} in the last hour vs. ${pct(pace)}/h average over 6h.`, `La subida se está frenando: ${pct(h1)} en la última hora vs. ${pct(pace)}/h de media en 6 h.`)
              : L(`The pace of the rally holds (${pct(h1)} in 1h).`, `El ritmo de subida se mantiene (${pct(h1)} en 1 h).`);
      } else {
        s = ramp(-h1, [[0, 0], [3, 25], [8, 55], [15, 80]]);
        detail =
          h1 < 0
            ? L(`No clear uptrend and down ${pct(h1)} in the last hour.`, `Sin tendencia alcista clara y cae ${pct(h1)} en la última hora.`)
            : L("No strong uptrend that could be running out.", "Sin tendencia alcista fuerte que se esté agotando.");
      }
      if (m5 != null && m5 < -2 && h1 > 0) s += 10; // fresh turn down
      factors.push(factor("momentum_decay", { available: true, score: s, value: same(`1h ${pct(h1)} · 6h ${pct(h6)}`), detail }));
    }
  }

  // 3. Volume decline.
  {
    const avg = prevHourlyAvg(m.volume.h1, m.volume.h6);
    if (avg == null || m.volume.h1 == null) factors.push(NA("volume_decline", L("Not enough volume to compare.", "Sin volumen suficiente para comparar.")));
    else {
      const ratio = m.volume.h1 / avg;
      const s = ramp(1 - ratio, [[0, 0], [0.3, 30], [0.5, 55], [0.7, 80], [0.9, 95]]);
      factors.push(
        factor("volume_decline", {
          available: true,
          score: s,
          value: L(`${(ratio * 100).toFixed(0)}% of average`, `${(ratio * 100).toFixed(0)}% del promedio`),
          detail:
            ratio < 1
              ? L(`Last-hour volume is ${((1 - ratio) * 100).toFixed(0)}% below the previous hourly average: buying interest is fading.`, `El volumen de la última hora es un ${((1 - ratio) * 100).toFixed(0)}% menor que el promedio horario previo: hay menos interés comprador.`)
              : L("Volume is holding at or above its recent average.", "El volumen se mantiene igual o por encima del promedio reciente."),
        }),
      );
    }
  }

  // 4. Sell pressure (transaction counts — DexScreener does not split volume by side).
  {
    const ratio = (t: { buys: number; sells: number } | null, min: number) =>
      t && t.buys + t.sells >= min ? t.sells / Math.max(t.buys, 1) : null;
    const r1 = ratio(m.txnsH1, 20);
    const r5 = ratio(m.txnsM5, 10);
    if (r1 == null && r5 == null) factors.push(NA("sell_pressure", L("Too few transactions to measure sell pressure.", "Muy pocas transacciones para medir la presión de venta.")));
    else {
      const f = (r: number) => ramp(r, [[0.8, 0], [1, 15], [1.3, 45], [1.7, 75], [2.5, 95]]);
      const s = Math.max(r1 != null ? f(r1) : 0, r5 != null ? f(r5) * 0.85 : 0);
      const shown = r1 ?? r5!;
      factors.push(
        factor("sell_pressure", {
          available: true,
          score: s,
          value: L(`${shown.toFixed(2)} sells per buy`, `${shown.toFixed(2)} ventas por compra`),
          detail:
            shown > 1.05
              ? L(
                  `More sells than buys (${m.txnsH1 ? `${m.txnsH1.sells} vs ${m.txnsH1.buys} in 1h` : "last 5 min"}).`,
                  `Hay más ventas que compras (${m.txnsH1 ? `${m.txnsH1.sells} vs ${m.txnsH1.buys} en 1 h` : "últimos 5 min"}).`,
                )
              : L("Buys match or exceed sells.", "Las compras igualan o superan a las ventas."),
        }),
      );
    }
  }

  // 5. Drawdown from the recent high (PeakAlert series, last ~6 h).
  {
    const pts = series.filter((p) => p.t >= now - 6 * 3600_000);
    if (price == null || pts.length < 5) factors.push(NA("drawdown", L("Not enough recorded history yet (needs a few minutes).", "Todavía no hay suficiente historial registrado (se necesitan unos minutos).")));
    else {
      const hi = Math.max(price, ...pts.map((p) => p.price));
      const dd = ((hi - price) / hi) * 100;
      factors.push(
        factor("drawdown", {
          available: true,
          score: ramp(dd, [[0, 0], [5, 20], [15, 50], [30, 85], [50, 100]]),
          value: L(`${(-dd).toFixed(1)}% from high`, `${(-dd).toFixed(1)}% desde máx.`),
          detail:
            dd >= 1
              ? L(`Price is ${dd.toFixed(1)}% below the high recorded over the last hours.`, `El precio está ${dd.toFixed(1)}% por debajo del máximo registrado en las últimas horas.`)
              : L("Price is at (or very close to) its recent high.", "El precio está en (o muy cerca de) su máximo reciente."),
        }),
      );
    }
  }

  // 6. Repeated rejections at the high.
  {
    const pts = series.filter((p) => p.t >= now - 6 * 3600_000);
    const span = pts.length ? pts[pts.length - 1].t - pts[0].t : 0;
    if (pts.length < 30 || span < 60 * 60_000) factors.push(NA("peak_rejections", L("Needs at least 1h of history to detect rejections.", "Se necesita al menos 1 h de historial para detectar rechazos.")));
    else {
      const touches = countPeakTouches(pts.map((p) => p.price));
      const atHighNow = price != null && price >= Math.max(...pts.map((p) => p.price)) * 0.97;
      const rejections = Math.max(0, touches - (atHighNow ? 1 : 0));
      factors.push(
        factor("peak_rejections", {
          available: true,
          score: ramp(rejections, [[0, 0], [1, 30], [2, 65], [3, 85]]),
          value: L(`${rejections} rejection${rejections === 1 ? "" : "s"}`, `${rejections} rechazo${rejections === 1 ? "" : "s"}`),
          detail:
            rejections >= 2
              ? L(`Price tried to break its high ${rejections} times and pulled back: the level is acting as resistance.`, `El precio intentó superar su máximo ${rejections} veces y retrocedió: el nivel actúa como resistencia.`)
              : rejections === 1
                ? L("One failed attempt to break the recent high.", "Un intento fallido de superar el máximo reciente.")
                : L("No repeated rejections at the high.", "Sin rechazos repetidos del máximo."),
        }),
      );
    }
  }

  // 7. Liquidity drop.
  {
    const pts = series.filter((p) => p.t >= now - 6 * 3600_000 && p.liquidity != null);
    const liqNow = m.liquidityUsd;
    if (liqNow == null || pts.length < 5) factors.push(NA("liquidity_drop", L("Not enough liquidity history.", "Sin historial de liquidez suficiente.")));
    else {
      const hi = Math.max(liqNow, ...pts.map((p) => p.liquidity!));
      const drop = ((hi - liqNow) / hi) * 100;
      factors.push(
        factor("liquidity_drop", {
          available: true,
          score: ramp(drop, [[0, 0], [5, 20], [15, 55], [30, 90]]),
          value: same(`${(-drop).toFixed(1)}%`),
          detail:
            drop >= 3
              ? L(
                  `Pool liquidity dropped ${drop.toFixed(1)}% from its recent level. Less liquidity = sharper moves and costlier exits.`,
                  `La liquidez del pool bajó ${drop.toFixed(1)}% desde su nivel reciente. Menos liquidez = movimientos más bruscos y salidas más caras.`,
                )
              : L("Liquidity is stable.", "La liquidez se mantiene estable."),
        }),
      );
    }
  }

  // 8. Abrupt market-cap moves in the last 5 min.
  {
    const m5 = m.change.m5;
    if (m5 == null) factors.push(NA("volatility_shock", L("No 5-minute change data.", "Sin variación de 5 min.")));
    else {
      const s = m5 < 0 ? ramp(-m5, [[0, 0], [5, 30], [15, 70], [30, 100]]) : ramp(m5, [[0, 0], [10, 15], [30, 45]]);
      factors.push(
        factor("volatility_shock", {
          available: true,
          score: s,
          value: same(`5m ${pct(m5)}`),
          detail:
            Math.abs(m5) >= 5
              ? m5 < 0
                ? L(`Sharp drop of ${pct(m5)} in 5 minutes.`, `Caída brusca de ${pct(m5)} en 5 minutos.`)
                : L(`Vertical move of ${pct(m5)} in 5 minutes (parabolic moves tend to be unstable).`, `Subida vertical de ${pct(m5)} en 5 minutos (los movimientos parabólicos suelen ser inestables).`)
              : L("No abrupt moves in the last 5 minutes.", "Sin movimientos bruscos en los últimos 5 minutos."),
        }),
      );
    }
  }

  const totalW = factors.reduce((s, f) => s + f.weight, 0);
  const availW = factors.filter((f) => f.available).reduce((s, f) => s + f.weight, 0);
  const score = availW ? clamp(factors.reduce((s, f) => s + (f.available ? f.score * f.weight : 0), 0) / availW) : 0;
  const level = levelFor(score);
  const top = factors.filter((f) => f.available && f.score >= 50).sort((a, b) => b.score * b.weight - a.score * a.weight).slice(0, 3);
  const summary = top.length
    ? L(
        `Main signals: ${top.map((f) => f.label.en.toLowerCase()).join(", ")}.`,
        `Señales principales: ${top.map((f) => f.label.es.toLowerCase()).join(", ")}.`,
      )
    : L("No strong exhaustion signals right now.", "No hay señales fuertes de agotamiento en este momento.");

  return { score, level, coverage: totalW ? availW / totalW : 0, factors, summary };
}

/**
 * Momentum score (0–100): how strong the CURRENT upward push is. Used to rank
 * "tokens with most momentum". Descriptive only.
 */
export function computeMomentum(m: RiskMarket): number | null {
  const { h1, h6 } = m.change;
  if (h1 == null && h6 == null) return null;
  const parts: Array<[number, number]> = [];
  if (h1 != null) parts.push([ramp(h1, [[-10, 0], [0, 35], [10, 70], [30, 100]]), 35]);
  if (h6 != null) parts.push([ramp(h6, [[-20, 0], [0, 30], [30, 70], [100, 100]]), 25]);
  const avg = prevHourlyAvg(m.volume.h1, m.volume.h6);
  if (avg != null && m.volume.h1 != null) parts.push([ramp(m.volume.h1 / avg, [[0.3, 0], [1, 50], [2, 85], [4, 100]]), 20]);
  if (m.txnsH1 && m.txnsH1.buys + m.txnsH1.sells >= 20) {
    parts.push([ramp(m.txnsH1.buys / Math.max(m.txnsH1.sells, 1), [[0.6, 0], [1, 50], [1.5, 85], [2.5, 100]]), 20]);
  }
  const w = parts.reduce((s, [, w]) => s + w, 0);
  return clamp(parts.reduce((s, [v, w]) => s + v * w, 0) / w);
}
