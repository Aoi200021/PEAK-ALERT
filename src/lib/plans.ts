import type { AlertType } from "./alerts/types";

export type PlanId = "free" | "pro" | "premium";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** Keep in sync with public.plan_token_limit() in supabase/migrations. */
  maxTokens: number;
  alertTypes: AlertType[];
  portfolio: boolean;
  /** How far back the alert history goes. null = unlimited. */
  historyHours: number | null;
  /** Premium can pick a custom cooldown per alert; others use the default. */
  customCooldown: boolean;
  analytics: boolean;
  /** Feature bullets shown in the UI. Only list things that actually exist. */
  features: string[];
}

const BASIC_ALERTS: AlertType[] = ["drawdown_from_peak", "price_spike"];
const ALL_ALERTS: AlertType[] = [
  "drawdown_from_peak",
  "price_spike",
  "volume_drop",
  "momentum_loss",
  "market_cap_cross",
];

export const DEFAULT_COOLDOWN_MINUTES = 60;

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    maxTokens: 2,
    alertTypes: BASIC_ALERTS,
    portfolio: false,
    historyHours: 24,
    customCooldown: false,
    analytics: false,
    features: [
      "Seguir hasta 2 tokens",
      "Alertas básicas: caída desde máximo y movimientos bruscos",
      "Notificaciones web push",
      "Historial de alertas de las últimas 24 h",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    maxTokens: 20,
    alertTypes: ALL_ALERTS,
    portfolio: true,
    historyHours: null,
    customCooldown: false,
    analytics: false,
    features: [
      "Seguir hasta 20 tokens",
      "Alertas avanzadas: volumen, momentum y market cap",
      "Portfolio tracker con P&L estimado",
      "Historial completo de alertas + Paper Exit",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    maxTokens: 100,
    alertTypes: ALL_ALERTS,
    portfolio: true,
    historyHours: null,
    customCooldown: true,
    analytics: true,
    features: [
      "Seguir hasta 100 tokens",
      "Todo lo de Pro",
      "Cooldown configurable por alerta (5 min – 24 h)",
      "Analíticas de efectividad de alertas (Paper Exit agregado)",
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
