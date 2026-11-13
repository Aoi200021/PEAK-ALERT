import { z } from "zod";

export const ALERT_TYPES = [
  "drawdown_from_peak",
  "price_spike",
  "volume_drop",
  "momentum_loss",
  "market_cap_cross",
  "exhaustion_risk",
  "liquidity_drop",
  "trend_break",
  "trailing_stop",
  "profit_giveback",
] as const;

/** Rules attached to a portfolio position instead of only a token. */
export const POSITION_ALERT_TYPES: readonly AlertType[] = ["trailing_stop", "profit_giveback"];

export type AlertType = (typeof ALERT_TYPES)[number];

const pct = (min: number, max: number) => z.number().finite().min(min).max(max);
const usd = z.number().finite().min(0).max(1e13);

export const drawdownParams = z.object({
  /** Fire when price is this % below the highest price seen since the rule was created / re-armed. */
  drop_pct: pct(1, 95),
  /** Optional: only arm once the peak market cap reached this value (e.g. 1,000,000). */
  min_peak_market_cap: usd.optional(),
});

export const priceSpikeParams = z.object({
  window: z.enum(["m5", "h1"]),
  direction: z.enum(["up", "down", "both"]),
  change_pct: pct(1, 1000),
});

export const volumeDropParams = z.object({
  /** Fire when last-hour volume is this % below the hourly average of the 5 hours before. */
  drop_pct: pct(10, 99),
  /** Ignore tokens whose previous hourly average is below this (noise filter). */
  min_avg_hourly_volume_usd: usd.default(1000),
});

export const momentumLossParams = z.object({
  /** The token must have risen at least this much over 6h… */
  min_gain_h6_pct: pct(5, 10000),
  /** …and be falling at least this much in the last hour… */
  drop_h1_pct: pct(1, 95),
  /** …with sells outnumbering buys by this ratio in the last hour (1 = more sells than buys). */
  min_sell_buy_ratio: z.number().finite().min(0.5).max(10).default(1),
});

export const marketCapCrossParams = z.object({
  direction: z.enum(["above", "below"]),
  value_usd: usd.refine((v) => v > 0, "Debe ser mayor que 0"),
});

export const exhaustionRiskParams = z.object({
  /** Fire when the Peak Detection score reaches this value. */
  min_score: z.number().int().min(31).max(100),
  /** Ignore scores computed with too little data (0–1). */
  min_coverage: z.number().min(0.3).max(1).default(0.6),
});

export const liquidityDropParams = z.object({
  window: z.enum(["1h", "6h"]),
  drop_pct: pct(3, 95),
});

export const trendBreakParams = z.object({
  /** Price falls this % below its 1-hour average… */
  below_avg_pct: pct(1, 50),
  /** …after rising at least this much over 6 h (0 = any trend). */
  min_gain_h6_pct: z.number().finite().min(0).max(10000).default(10),
});

export const trailingStopParams = z.object({
  /** Fire when price is this % below the highest price since your entry. */
  trail_pct: pct(1, 90),
  /** Only while the position is still in profit. */
  only_in_profit: z.boolean().default(false),
});

export const profitGivebackParams = z.object({
  /** Fire when you've given back this % of the maximum unrealized profit… */
  giveback_pct: pct(5, 100),
  /** …once the position had been up at least this much. */
  min_profit_pct: pct(1, 100000).default(20),
});

export const PARAM_SCHEMAS = {
  drawdown_from_peak: drawdownParams,
  price_spike: priceSpikeParams,
  volume_drop: volumeDropParams,
  momentum_loss: momentumLossParams,
  market_cap_cross: marketCapCrossParams,
  exhaustion_risk: exhaustionRiskParams,
  liquidity_drop: liquidityDropParams,
  trend_break: trendBreakParams,
  trailing_stop: trailingStopParams,
  profit_giveback: profitGivebackParams,
} as const;

export type ParamsFor<T extends AlertType> = z.infer<(typeof PARAM_SCHEMAS)[T]>;

export const ALERT_META: Record<
  AlertType,
  { label: string; short: string; description: string }
> = {
  drawdown_from_peak: {
    label: "Caída desde el máximo",
    short: "Drawdown",
    description:
      "Se activa cuando el precio cae un % desde el máximo que PeakAlert ha registrado desde que creaste la alerta.",
  },
  price_spike: {
    label: "Movimiento brusco de precio",
    short: "Spike",
    description: "Se activa cuando la variación en 5 min o 1 h supera el umbral.",
  },
  volume_drop: {
    label: "Caída del volumen",
    short: "Volumen",
    description:
      "Compara el volumen de la última hora con el promedio horario de las 5 horas anteriores.",
  },
  momentum_loss: {
    label: "Pérdida de momentum",
    short: "Momentum",
    description:
      "Heurística: el token subió fuerte en 6 h, ahora cae en 1 h y hay más ventas que compras.",
  },
  market_cap_cross: {
    label: "Cruce de market cap",
    short: "Market cap",
    description: "Se activa cuando el market cap cruza por encima o por debajo de un valor.",
  },
  exhaustion_risk: {
    label: "Riesgo de agotamiento (Peak Detection)",
    short: "Agotamiento",
    description: "Se activa cuando la puntuación de riesgo de agotamiento del impulso (0–100) supera tu umbral.",
  },
  liquidity_drop: {
    label: "Movimiento anormal de liquidez",
    short: "Liquidez",
    description: "Se activa cuando la liquidez del pool cae un % en 1 h o 6 h.",
  },
  trend_break: {
    label: "Ruptura de tendencia",
    short: "Tendencia",
    description: "Tras una subida, el precio cae por debajo de su precio medio de la última hora.",
  },
  trailing_stop: {
    label: "Trailing stop (posición)",
    short: "Trailing",
    description: "Se activa cuando el precio cae un % desde el máximo alcanzado desde tu entrada.",
  },
  profit_giveback: {
    label: "Retroceso de beneficio (posición)",
    short: "Retroceso",
    description: "Se activa cuando devuelves un % del beneficio máximo no realizado de tu posición.",
  },
};

export type Severity = "info" | "warning" | "high" | "critical";

/** Every alert explains itself in plain language. */
export interface AlertExplanation {
  what: string; // Qué está pasando
  why: string; // Por qué se generó
  indicators: { label: string; value: string; tone?: "up" | "down" | "warn" | "neutral" }[];
  risk: string; // Qué riesgo representa
  watch: string[]; // Qué podría vigilar
}

/** Extra context computed from PeakAlert's own history (all optional). */
export interface MarketContext {
  risk?: { score: number; coverage: number; level: string; summary: string; factors: { label: string; score: number; available: boolean; value: string | null }[] };
  /** % change of pool liquidity vs. 1 h / 6 h ago (null = not enough history). */
  liquidityChange?: { "1h": number | null; "6h": number | null };
  /** Average price over the last 60 minutes (null = not enough history). */
  avgPrice1h?: number | null;
  /** For position-based rules. */
  position?: { entryPrice: number; peakPrice: number; quantity: number };
}

/** Market data the engine needs. Every field may be null: we never invent data. */
export interface MarketData {
  priceUsd: number | null;
  marketCap: number | null;
  volume: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  change: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  txnsH1: { buys: number; sells: number } | null;
  /** When the data was fetched from the market API. */
  updatedAt: Date | null;
  liquidityUsd?: number | null;
  context?: MarketContext;
}

export interface RuleRuntime {
  type: AlertType;
  params: unknown;
  armed: boolean;
  state: Record<string, unknown>;
  cooldownMinutes: number;
  lastTriggeredAt: Date | null;
}

export interface EvaluationResult {
  fire: boolean;
  armed: boolean;
  state: Record<string, unknown>;
  /** Present when fire === true */
  event?: {
    title: string;
    message: string;
    metrics: Record<string, number | string | null>;
    severity: Severity;
    explanation: AlertExplanation;
  };
  /** Why nothing happened (useful for debugging/UI). */
  skipped?: string;
}
