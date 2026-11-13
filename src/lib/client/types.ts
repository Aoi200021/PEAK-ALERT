import type { AlertExplanation, AlertType, Severity } from "../alerts/types";
import type { RiskFactor } from "../risk/score";
import type { Checkpoints } from "../paper-exit";
import type { PlanDefinition } from "../plans";

type N = number | string | null;

export interface TokenDTO {
  id: string;
  chain_id: string;
  address: string;
  pair_address: string | null;
  dex_id: string | null;
  pair_url: string | null;
  name: string | null;
  symbol: string | null;
  image_url: string | null;
  price_usd: N;
  market_cap: N;
  fdv: N;
  liquidity_usd: N;
  volume_m5: N;
  volume_h1: N;
  volume_h6: N;
  volume_h24: N;
  change_m5: N;
  change_h1: N;
  change_h6: N;
  change_h24: N;
  txns: Record<string, { buys: number; sells: number } | null> | null;
  pair_created_at: string | null;
  peak_price: N;
  peak_market_cap: N;
  peak_at: string | null;
  data_updated_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  risk_score?: number | null;
  risk_level?: string | null;
  risk_coverage?: N;
  risk_factors?: RiskFactor[] | null;
  momentum_score?: number | null;
  risk_updated_at?: string | null;
  data_source?: string | null;
  sparkline?: number[];
  added_price?: N;
  added_at?: string;
}

export interface WatchlistResponse {
  tokens: TokenDTO[];
  limit: number;
  plan: string;
  refreshError: string | null;
  serverTime: string;
}

export interface RuleDTO {
  id: string;
  token_id: string;
  type: AlertType;
  params: Record<string, unknown>;
  enabled: boolean;
  cooldown_minutes: number;
  armed: boolean;
  state: Record<string, unknown>;
  last_triggered_at: string | null;
  created_at: string;
  position_id?: string | null;
  token?: Pick<TokenDTO, "id" | "symbol" | "name" | "chain_id" | "image_url" | "price_usd" | "risk_score" | "risk_level">;
  position?: { id: string; entry_price: N; invested_usd: N; exit_price: N } | null;
}

export interface PositionDTO {
  id: string;
  token_id: string;
  entry_price: N;
  invested_usd: N;
  entry_at: string;
  exit_price: N;
  exit_at: string | null;
  notes: string | null;
  entry_market_cap?: N;
  peak_price?: N;
  peak_at?: string | null;
  token?: Pick<TokenDTO, "id" | "symbol" | "name" | "chain_id" | "image_url" | "price_usd" | "data_updated_at" | "market_cap" | "risk_score" | "risk_level">;
}

export interface PaperDTO {
  alert_price: N;
  quantity: N;
  entry_price: N;
  checkpoints: Checkpoints;
  max_price_after: N;
  min_price_after: N;
  last_price: N;
  last_checked_at: string | null;
  closed: boolean;
  position_id: string | null;
}

export interface EventDTO {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  price_usd: N;
  market_cap: N;
  metrics: Record<string, unknown>;
  severity: Severity | null;
  explanation: AlertExplanation | null;
  created_at: string;
  read_at: string | null;
  notified_at: string | null;
  notify_error: string | null;
  rule_id: string | null;
  token: Pick<TokenDTO, "id" | "symbol" | "name" | "chain_id" | "address" | "image_url" | "price_usd" | "risk_score" | "risk_level"> | null;
  paper: PaperDTO | null;
}

export interface MeResponse {
  email: string;
  plan: PlanDefinition;
  usage: { tokens: number; rules: number; pushDevices: number };
  pushConfigured: boolean;
  billingEnabled: boolean;
  subscription: { hasCustomer: boolean; status: string | null; currentPeriodEnd: string | null };
}
