import { z } from "zod";
import { L, msg, type L10n } from "../i18n";

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
  value_usd: usd.refine((v) => v > 0, msg("Must be greater than 0", "Debe ser mayor que 0")),
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

export const ALERT_META: Record<AlertType, { label: L10n; short: L10n; description: L10n }> = {
  drawdown_from_peak: {
    label: L("Drop from high", "Caída desde el máximo"),
    short: L("Drawdown", "Drawdown"),
    description: L(
      "Fires when price falls a % below the highest price PeakAlert has recorded since you created the alert.",
      "Se activa cuando el precio cae un % desde el máximo que PeakAlert ha registrado desde que creaste la alerta.",
    ),
  },
  price_spike: {
    label: L("Sudden price move", "Movimiento brusco de precio"),
    short: L("Spike", "Spike"),
    description: L("Fires when the 5-min or 1-hour change exceeds the threshold.", "Se activa cuando la variación en 5 min o 1 h supera el umbral."),
  },
  volume_drop: {
    label: L("Volume drop", "Caída del volumen"),
    short: L("Volume", "Volumen"),
    description: L(
      "Compares last-hour volume with the hourly average of the previous 5 hours.",
      "Compara el volumen de la última hora con el promedio horario de las 5 horas anteriores.",
    ),
  },
  momentum_loss: {
    label: L("Momentum loss", "Pérdida de momentum"),
    short: L("Momentum", "Momentum"),
    description: L(
      "Heuristic: the token rallied hard over 6h, is now falling over 1h and sells outnumber buys.",
      "Heurística: el token subió fuerte en 6 h, ahora cae en 1 h y hay más ventas que compras.",
    ),
  },
  market_cap_cross: {
    label: L("Market cap cross", "Cruce de market cap"),
    short: L("Market cap", "Market cap"),
    description: L("Fires when market cap crosses above or below a level.", "Se activa cuando el market cap cruza por encima o por debajo de un valor."),
  },
  exhaustion_risk: {
    label: L("Exhaustion risk (Peak Detection)", "Riesgo de agotamiento (Peak Detection)"),
    short: L("Exhaustion", "Agotamiento"),
    description: L(
      "Fires when the momentum-exhaustion risk score (0–100) goes above your threshold.",
      "Se activa cuando la puntuación de riesgo de agotamiento del impulso (0–100) supera tu umbral.",
    ),
  },
  liquidity_drop: {
    label: L("Unusual liquidity move", "Movimiento anormal de liquidez"),
    short: L("Liquidity", "Liquidez"),
    description: L("Fires when pool liquidity falls a % within 1h or 6h.", "Se activa cuando la liquidez del pool cae un % en 1 h o 6 h."),
  },
  trend_break: {
    label: L("Trend break", "Ruptura de tendencia"),
    short: L("Trend", "Tendencia"),
    description: L(
      "After a rally, price drops below its average price of the last hour.",
      "Tras una subida, el precio cae por debajo de su precio medio de la última hora.",
    ),
  },
  trailing_stop: {
    label: L("Trailing stop (position)", "Trailing stop (posición)"),
    short: L("Trailing", "Trailing"),
    description: L("Fires when price falls a % from the highest price since your entry.", "Se activa cuando el precio cae un % desde el máximo alcanzado desde tu entrada."),
  },
  profit_giveback: {
    label: L("Profit giveback (position)", "Retroceso de beneficio (posición)"),
    short: L("Giveback", "Retroceso"),
    description: L(
      "Fires when you've given back a % of your position's maximum unrealized profit.",
      "Se activa cuando devuelves un % del beneficio máximo no realizado de tu posición.",
    ),
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
  risk?: {
    score: number;
    coverage: number;
    level: string;
    summary: L10n;
    factors: { key: string; label: L10n; score: number; available: boolean; value: L10n | null }[];
  };
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
