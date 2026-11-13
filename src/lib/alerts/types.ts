import { z } from "zod";

export const ALERT_TYPES = [
  "drawdown_from_peak",
  "price_spike",
  "volume_drop",
  "momentum_loss",
  "market_cap_cross",
] as const;

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

export const PARAM_SCHEMAS = {
  drawdown_from_peak: drawdownParams,
  price_spike: priceSpikeParams,
  volume_drop: volumeDropParams,
  momentum_loss: momentumLossParams,
  market_cap_cross: marketCapCrossParams,
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
};

/** Market data the engine needs. Every field may be null: we never invent data. */
export interface MarketData {
  priceUsd: number | null;
  marketCap: number | null;
  volume: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  change: { m5: number | null; h1: number | null; h6: number | null; h24: number | null };
  txnsH1: { buys: number; sells: number } | null;
  /** When the data was fetched from the market API. */
  updatedAt: Date | null;
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
  event?: { title: string; message: string; metrics: Record<string, number | string | null> };
  /** Why nothing happened (useful for debugging/UI). */
  skipped?: string;
}
