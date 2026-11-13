import type { AlertType } from "./alerts/types";

export type PlanId = "free" | "pro" | "premium";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** Monthly price in USD (display only — the real charge is the Stripe Price you configure). */
  priceUsd: number;
  tagline: string;
  /** Keep in sync with public.plan_token_limit() in supabase/migrations. */
  maxTokens: number;
  alertTypes: AlertType[];
  /** Full factor-by-factor breakdown of the Peak Detection score. */
  riskBreakdown: boolean;
  /** Profit Protection (positions, P&L, trailing stop simulation). */
  portfolio: boolean;
  /** How far back the alert history goes. null = unlimited. */
  historyHours: number | null;
  /** Historical chart of the risk score per token. */
  signalHistory: boolean;
  /** Custom cooldown per alert. */
  customCooldown: boolean;
  analytics: boolean;
  /** Push notifications sent with high urgency. */
  priorityAlerts: boolean;
  /** Feature bullets shown in the UI. Only list things that actually exist. */
  features: string[];
}

const BASIC_ALERTS: AlertType[] = ["drawdown_from_peak", "price_spike", "volume_drop"];
const ALL_ALERTS: AlertType[] = [
  "drawdown_from_peak",
  "price_spike",
  "volume_drop",
  "exhaustion_risk",
  "momentum_loss",
  "trend_break",
  "liquidity_drop",
  "market_cap_cross",
  "trailing_stop",
  "profit_giveback",
];

export const DEFAULT_COOLDOWN_MINUTES = 60;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceUsd: 0,
    tagline: "Para probar PeakAlert con tus primeras monedas.",
    maxTokens: 3,
    alertTypes: BASIC_ALERTS,
    riskBreakdown: false,
    portfolio: false,
    historyHours: 24,
    signalHistory: false,
    customCooldown: false,
    analytics: false,
    priorityAlerts: false,
    features: [
      "Hasta 3 tokens monitoreados",
      "Puntuación de riesgo de agotamiento (0–100)",
      "Alertas básicas: caída desde máximo, movimientos bruscos y caída de volumen",
      "Dashboard básico y notificaciones push",
      "Historial de alertas de 24 h",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsd: 5,
    tagline: "Para traders activos que quieren proteger sus ganancias.",
    maxTokens: 25,
    alertTypes: ALL_ALERTS,
    riskBreakdown: true,
    portfolio: true,
    historyHours: 24 * 7,
    signalHistory: false,
    customCooldown: false,
    analytics: false,
    priorityAlerts: false,
    features: [
      "Hasta 25 tokens monitoreados",
      "Peak Detection avanzado: desglose de los 8 factores de riesgo",
      "Alertas personalizadas: agotamiento, momentum, tendencia, liquidez y market cap",
      "Profit Protection: P&L, ROI, trailing stop y retroceso de beneficio",
      "Historial de alertas de 7 días",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    priceUsd: 10,
    tagline: "Monitoreo ampliado y análisis avanzado.",
    maxTokens: 100,
    alertTypes: ALL_ALERTS,
    riskBreakdown: true,
    portfolio: true,
    historyHours: null,
    signalHistory: true,
    customCooldown: true,
    analytics: true,
    priorityAlerts: true,
    features: [
      "Monitoreo ampliado: hasta 100 tokens",
      "Todo lo de Pro",
      "Alertas prioritarias (push de alta urgencia)",
      "Historial de señales: evolución del riesgo por token e historial completo de alertas",
      "Análisis avanzado: efectividad de tus alertas (Paper Exit agregado)",
      "Configuración avanzada: cooldown por alerta (5 min – 24 h)",
    ],
  },
};

export function getPlan(id: string | null | undefined): PlanDefinition {
  if (id === "pro" || id === "premium") return PLANS[id];
  return PLANS.free;
}

export function planAllowsAlert(plan: PlanDefinition, type: AlertType): boolean {
  return plan.alertTypes.includes(type);
}

/** Smallest plan that unlocks an alert type (for upgrade hints). */
export function requiredPlanForAlert(type: AlertType): PlanId {
  return BASIC_ALERTS.includes(type) ? "free" : "pro";
}

/** Comparison table for the pricing page. Values must reflect real behaviour. */
export const COMPARISON: { label: string; values: [string | boolean, string | boolean, string | boolean] }[] = [
  { label: "Tokens monitoreados", values: ["3", "25", "100"] },
  { label: "Puntuación de riesgo de agotamiento", values: [true, true, true] },
  { label: "Desglose de factores (Peak Detection avanzado)", values: [false, true, true] },
  { label: "Alertas de caída desde máximo, spikes y volumen", values: [true, true, true] },
  { label: "Alertas de agotamiento, momentum, tendencia, liquidez y market cap", values: [false, true, true] },
  { label: "Profit Protection (P&L, ROI, trailing stop)", values: [false, true, true] },
  { label: "Historial de alertas", values: ["24 h", "7 días", "Completo"] },
  { label: "Historial de señales (riesgo en el tiempo)", values: [false, false, true] },
  { label: "Alertas prioritarias", values: [false, false, true] },
  { label: "Análisis de efectividad de alertas", values: [false, false, true] },
  { label: "Cooldown configurable por alerta", values: [false, false, true] },
  { label: "Notificaciones web push", values: [true, true, true] },
];
