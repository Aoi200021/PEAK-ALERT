import type { AlertType } from "./alerts/types";
import { L, type L10n } from "./i18n";

export type PlanId = "free" | "pro" | "premium";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** Monthly price in USD (display only — the real charge is the Stripe Price you configure). */
  priceUsd: number;
  tagline: L10n;
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
  features: L10n[];
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
    tagline: L("Try PeakAlert with your first coins.", "Para probar PeakAlert con tus primeras monedas."),
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
      L("Track up to 3 tokens", "Hasta 3 tokens monitoreados"),
      L("Exhaustion risk score (0–100)", "Puntuación de riesgo de agotamiento (0–100)"),
      L("Basic alerts: drop from high, sudden moves and volume drop", "Alertas básicas: caída desde máximo, movimientos bruscos y caída de volumen"),
      L("Basic dashboard and push notifications", "Dashboard básico y notificaciones push"),
      L("24h alert history", "Historial de alertas de 24 h"),
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsd: 5,
    tagline: L("For active traders who want to protect their gains.", "Para traders activos que quieren proteger sus ganancias."),
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
      L("Track up to 25 tokens", "Hasta 25 tokens monitoreados"),
      L("Advanced Peak Detection: breakdown of all 8 risk factors", "Peak Detection avanzado: desglose de los 8 factores de riesgo"),
      L("Custom alerts: exhaustion, momentum, trend, liquidity and market cap", "Alertas personalizadas: agotamiento, momentum, tendencia, liquidez y market cap"),
      L("Profit Protection: P&L, ROI, trailing stop and profit giveback", "Profit Protection: P&L, ROI, trailing stop y retroceso de beneficio"),
      L("7-day alert history", "Historial de alertas de 7 días"),
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    priceUsd: 10,
    tagline: L("Extended monitoring and advanced analysis.", "Monitoreo ampliado y análisis avanzado."),
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
      L("Extended monitoring: up to 100 tokens", "Monitoreo ampliado: hasta 100 tokens"),
      L("Everything in Pro", "Todo lo de Pro"),
      L("Priority alerts (high-urgency push)", "Alertas prioritarias (push de alta urgencia)"),
      L("Signal history: risk over time per token and full alert history", "Historial de señales: evolución del riesgo por token e historial completo de alertas"),
      L("Advanced analysis: how effective your alerts are (aggregated Paper Exit)", "Análisis avanzado: efectividad de tus alertas (Paper Exit agregado)"),
      L("Advanced settings: per-alert cooldown (5 min – 24 h)", "Configuración avanzada: cooldown por alerta (5 min – 24 h)"),
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
type Cell = L10n | boolean;
export const COMPARISON: { label: L10n; values: [Cell, Cell, Cell] }[] = [
  { label: L("Tokens tracked", "Tokens monitoreados"), values: [L("3", "3"), L("25", "25"), L("100", "100")] },
  { label: L("Exhaustion risk score", "Puntuación de riesgo de agotamiento"), values: [true, true, true] },
  { label: L("Factor breakdown (advanced Peak Detection)", "Desglose de factores (Peak Detection avanzado)"), values: [false, true, true] },
  { label: L("Drop-from-high, spike and volume alerts", "Alertas de caída desde máximo, spikes y volumen"), values: [true, true, true] },
  { label: L("Exhaustion, momentum, trend, liquidity and market cap alerts", "Alertas de agotamiento, momentum, tendencia, liquidez y market cap"), values: [false, true, true] },
  { label: L("Profit Protection (P&L, ROI, trailing stop)", "Profit Protection (P&L, ROI, trailing stop)"), values: [false, true, true] },
  { label: L("Alert history", "Historial de alertas"), values: [L("24h", "24 h"), L("7 days", "7 días"), L("Full", "Completo")] },
  { label: L("Signal history (risk over time)", "Historial de señales (riesgo en el tiempo)"), values: [false, false, true] },
  { label: L("Priority alerts", "Alertas prioritarias"), values: [false, false, true] },
  { label: L("Alert effectiveness analytics", "Análisis de efectividad de alertas"), values: [false, false, true] },
  { label: L("Per-alert cooldown", "Cooldown configurable por alerta"), values: [false, false, true] },
  { label: L("Web push notifications", "Notificaciones web push"), values: [true, true, true] },
];
