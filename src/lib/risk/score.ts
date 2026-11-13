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
  label: string;
  weight: number;
  available: boolean;
  score: number; // 0..100 (0 when unavailable)
  value: string | null; // short formatted metric
  detail: string; // plain-language explanation
}

export interface RiskResult {
  score: number; // 0..100
  level: RiskLevel;
  coverage: number; // 0..1 share of weight with data
  factors: RiskFactor[];
  summary: string;
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

export const LEVELS: Record<RiskLevel, { label: string; range: string; tone: "up" | "warn" | "orange" | "down" }> = {
  healthy: { label: "Momentum saludable", range: "0–30", tone: "up" },
  caution: { label: "Precaución", range: "31–60", tone: "warn" },
  elevated: { label: "Riesgo elevado", range: "61–80", tone: "orange" },
  very_high: { label: "Riesgo muy elevado", range: "81–100", tone: "down" },
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

function factor(key: FactorKey, label: string, partial: Omit<RiskFactor, "key" | "label" | "weight">): RiskFactor {
  return { key, label, weight: FACTOR_WEIGHTS[key], ...partial, score: partial.available ? clamp(partial.score) : 0 };
}

const NA = (key: FactorKey, label: string, why: string) =>
  factor(key, label, { available: false, score: 0, value: null, detail: why });

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
    if (h6 == null && h24 == null) factors.push(NA("run_up", "Subida previa", "Sin datos de variación 6 h / 24 h."));
    else {
      const s = Math.max(h6 != null ? ramp(h6 * 1.5, [[0, 0], [50, 40], [150, 70], [400, 90]]) : 0, h24 != null ? ramp(h24, [[0, 0], [50, 35], [150, 65], [400, 90]]) : 0);
      factors.push(
        factor("run_up", "Subida previa", {
          available: true,
          score: s,
          value: `6h ${h6 != null ? pct(h6, 0) : "—"} · 24h ${h24 != null ? pct(h24, 0) : "—"}`,
          detail:
            s >= 50
              ? "El token viene de una subida fuerte. Tras rallies así, los retrocesos son frecuentes."
              : "No hay una subida previa extrema; el contexto de agotamiento es menor.",
        }),
      );
    }
  }

  // 2. Momentum decay: last hour vs the 6h pace.
  {
    const { h1, h6, m5 } = m.change;
    if (h1 == null || h6 == null) factors.push(NA("momentum_decay", "Pérdida de momentum", "Sin datos de variación 1 h / 6 h."));
    else {
      const pace = h6 / 6; // average % per hour over 6h
      let s: number;
      let detail: string;
      if (h6 > 2) {
        // Was rising: how much slower (or negative) is the last hour?
        const decay = pace > 0 ? (pace - h1) / pace : 0; // 0 = same pace, 1 = flat, >1 = falling
        s = ramp(decay, [[0, 0], [0.5, 25], [1, 50], [2, 75], [4, 95]]);
        detail =
          h1 < 0
            ? `Subía a un ritmo medio de ${pct(pace)} por hora, pero la última hora cae ${pct(h1)}.`
            : h1 < pace
              ? `La subida se está frenando: ${pct(h1)} en la última hora vs. ${pct(pace)}/h de media en 6 h.`
              : `El ritmo de subida se mantiene (${pct(h1)} en 1 h).`;
      } else {
        s = ramp(-h1, [[0, 0], [3, 25], [8, 55], [15, 80]]);
        detail = h1 < 0 ? `Sin tendencia alcista clara y cae ${pct(h1)} en la última hora.` : "Sin tendencia alcista fuerte que se esté agotando.";
      }
      if (m5 != null && m5 < -2 && h1 > 0) s += 10; // fresh turn down
      factors.push(factor("momentum_decay", "Pérdida de momentum", { available: true, score: s, value: `1h ${pct(h1)} · 6h ${pct(h6)}`, detail }));
    }
  }

  // 3. Volume decline.
  {
    const avg = prevHourlyAvg(m.volume.h1, m.volume.h6);
    if (avg == null || m.volume.h1 == null) factors.push(NA("volume_decline", "Caída del volumen", "Sin volumen suficiente para comparar."));
    else {
      const ratio = m.volume.h1 / avg;
      const s = ramp(1 - ratio, [[0, 0], [0.3, 30], [0.5, 55], [0.7, 80], [0.9, 95]]);
      factors.push(
        factor("volume_decline", "Caída del volumen", {
          available: true,
          score: s,
          value: `${(ratio * 100).toFixed(0)}% del promedio`,
          detail:
            ratio < 1
              ? `El volumen de la última hora es un ${((1 - ratio) * 100).toFixed(0)}% menor que el promedio horario previo: hay menos interés comprador.`
              : "El volumen se mantiene igual o por encima del promedio reciente.",
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
    if (r1 == null && r5 == null) factors.push(NA("sell_pressure", "Presión de venta", "Muy pocas transacciones para medir la presión de venta."));
    else {
      const f = (r: number) => ramp(r, [[0.8, 0], [1, 15], [1.3, 45], [1.7, 75], [2.5, 95]]);
      const s = Math.max(r1 != null ? f(r1) : 0, r5 != null ? f(r5) * 0.85 : 0);
      const shown = r1 ?? r5!;
      factors.push(
        factor("sell_pressure", "Presión de venta", {
          available: true,
          score: s,
          value: `${shown.toFixed(2)} ventas por compra`,
          detail:
            shown > 1.05
              ? `Hay más ventas que compras (${m.txnsH1 ? `${m.txnsH1.sells} vs ${m.txnsH1.buys} en 1 h` : "últimos 5 min"}).`
              : "Las compras igualan o superan a las ventas.",
        }),
      );
    }
  }

  // 5. Drawdown from the recent high (PeakAlert series, last ~6 h).
  {
    const pts = series.filter((p) => p.t >= now - 6 * 3600_000);
    if (price == null || pts.length < 5) factors.push(NA("drawdown", "Caída desde el máximo reciente", "Todavía no hay suficiente historial registrado (se necesitan unos minutos)."));
    else {
      const hi = Math.max(price, ...pts.map((p) => p.price));
      const dd = ((hi - price) / hi) * 100;
      factors.push(
        factor("drawdown", "Caída desde el máximo reciente", {
          available: true,
          score: ramp(dd, [[0, 0], [5, 20], [15, 50], [30, 85], [50, 100]]),
          value: `${(-dd).toFixed(1)}% desde máx.`,
          detail: dd >= 1 ? `El precio está ${dd.toFixed(1)}% por debajo del máximo registrado en las últimas horas.` : "El precio está en (o muy cerca de) su máximo reciente.",
        }),
      );
    }
  }

  // 6. Repeated rejections at the high.
  {
    const pts = series.filter((p) => p.t >= now - 6 * 3600_000);
    const span = pts.length ? pts[pts.length - 1].t - pts[0].t : 0;
    if (pts.length < 30 || span < 60 * 60_000) factors.push(NA("peak_rejections", "Rechazos del máximo", "Se necesita al menos 1 h de historial para detectar rechazos."));
    else {
      const touches = countPeakTouches(pts.map((p) => p.price));
      const atHighNow = price != null && price >= Math.max(...pts.map((p) => p.price)) * 0.97;
      const rejections = Math.max(0, touches - (atHighNow ? 1 : 0));
      factors.push(
        factor("peak_rejections", "Rechazos del máximo", {
          available: true,
          score: ramp(rejections, [[0, 0], [1, 30], [2, 65], [3, 85]]),
          value: `${rejections} rechazo${rejections === 1 ? "" : "s"}`,
          detail:
            rejections >= 2
              ? `El precio intentó superar su máximo ${rejections} veces y retrocedió: el nivel actúa como resistencia.`
              : rejections === 1
                ? "Un intento fallido de superar el máximo reciente."
                : "Sin rechazos repetidos del máximo.",
        }),
      );
    }
  }

  // 7. Liquidity drop.
  {
    const pts = series.filter((p) => p.t >= now - 6 * 3600_000 && p.liquidity != null);
    const liqNow = m.liquidityUsd;
    if (liqNow == null || pts.length < 5) factors.push(NA("liquidity_drop", "Caída de liquidez", "Sin historial de liquidez suficiente."));
    else {
      const hi = Math.max(liqNow, ...pts.map((p) => p.liquidity!));
      const drop = ((hi - liqNow) / hi) * 100;
      factors.push(
        factor("liquidity_drop", "Caída de liquidez", {
          available: true,
          score: ramp(drop, [[0, 0], [5, 20], [15, 55], [30, 90]]),
          value: `${(-drop).toFixed(1)}%`,
          detail:
            drop >= 3
              ? `La liquidez del pool bajó ${drop.toFixed(1)}% desde su nivel reciente. Menos liquidez = movimientos más bruscos y salidas más caras.`
              : "La liquidez se mantiene estable.",
        }),
      );
    }
  }

  // 8. Abrupt market-cap moves in the last 5 min.
  {
    const m5 = m.change.m5;
    if (m5 == null) factors.push(NA("volatility_shock", "Movimiento brusco", "Sin variación de 5 min."));
    else {
      const s = m5 < 0 ? ramp(-m5, [[0, 0], [5, 30], [15, 70], [30, 100]]) : ramp(m5, [[0, 0], [10, 15], [30, 45]]);
      factors.push(
        factor("volatility_shock", "Movimiento brusco", {
          available: true,
          score: s,
          value: `5m ${pct(m5)}`,
          detail:
            Math.abs(m5) >= 5
              ? m5 < 0
                ? `Caída brusca de ${pct(m5)} en 5 minutos.`
                : `Subida vertical de ${pct(m5)} en 5 minutos (los movimientos parabólicos suelen ser inestables).`
              : "Sin movimientos bruscos en los últimos 5 minutos.",
        }),
      );
    }
  }

  const totalW = factors.reduce((s, f) => s + f.weight, 0);
  const availW = factors.filter((f) => f.available).reduce((s, f) => s + f.weight, 0);
  const score = availW ? clamp(factors.reduce((s, f) => s + (f.available ? f.score * f.weight : 0), 0) / availW) : 0;
  const level = levelFor(score);
  const top = factors.filter((f) => f.available && f.score >= 50).sort((a, b) => b.score * b.weight - a.score * a.weight);
  const summary = top.length
    ? `Señales principales: ${top
        .slice(0, 3)
        .map((f) => f.label.toLowerCase())
        .join(", ")}.`
    : "No hay señales fuertes de agotamiento en este momento.";

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
