-- PeakAlert — v2: Peak Detection (risk score), smart alerts, profit protection, new plan limits.
-- Run AFTER 0001_init.sql. Idempotent: safe to run more than once.

-- ---------------------------------------------------------------------------
-- Plan limits: Free 3 · Pro 25 · Premium 100   (keep in sync with src/lib/plans.ts)
-- ---------------------------------------------------------------------------
create or replace function public.plan_token_limit(p public.plan_tier)
returns integer language sql immutable as $$
  select case p when 'free' then 3 when 'pro' then 25 when 'premium' then 100 end
$$;

-- ---------------------------------------------------------------------------
-- New alert types
-- ---------------------------------------------------------------------------
alter type public.alert_type add value if not exists 'exhaustion_risk';
alter type public.alert_type add value if not exists 'liquidity_drop';
alter type public.alert_type add value if not exists 'trend_break';
alter type public.alert_type add value if not exists 'trailing_stop';
alter type public.alert_type add value if not exists 'profit_giveback';

-- ---------------------------------------------------------------------------
-- Peak Detection: exhaustion risk score stored with the market data
-- ---------------------------------------------------------------------------
alter table public.tokens add column if not exists risk_score smallint check (risk_score between 0 and 100);
alter table public.tokens add column if not exists risk_level text;
alter table public.tokens add column if not exists risk_coverage numeric;          -- 0..1 share of factors with data
alter table public.tokens add column if not exists risk_factors jsonb;
alter table public.tokens add column if not exists momentum_score smallint check (momentum_score between 0 and 100);
alter table public.tokens add column if not exists risk_updated_at timestamptz;
alter table public.tokens add column if not exists data_source text;               -- 'dexscreener' | 'birdeye'

alter table public.token_snapshots add column if not exists risk_score smallint;
alter table public.token_snapshots add column if not exists momentum_score smallint;

-- ---------------------------------------------------------------------------
-- Profit Protection
-- ---------------------------------------------------------------------------
alter table public.positions add column if not exists entry_market_cap numeric check (entry_market_cap > 0);
-- Highest price observed since entry (PeakAlert data; before tracking started it's unknown)
alter table public.positions add column if not exists peak_price numeric;
alter table public.positions add column if not exists peak_at timestamptz;

-- Position-based rules (trailing stop, profit giveback)
alter table public.alert_rules add column if not exists position_id uuid references public.positions (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Explainable alerts
-- ---------------------------------------------------------------------------
alter table public.alert_events add column if not exists explanation jsonb;
alter table public.alert_events add column if not exists severity text;            -- info | warning | high | critical

-- ---------------------------------------------------------------------------
-- History RPCs
-- ---------------------------------------------------------------------------

-- Charts: now also returns the risk score per bucket.
drop function if exists public.token_history(uuid, timestamptz, integer);
create or replace function public.token_history(p_token uuid, p_since timestamptz, p_bucket_seconds integer)
returns table (t timestamptz, price numeric, market_cap numeric, volume_h1 numeric, risk_score smallint, liquidity_usd numeric)
language sql stable as $$
  select
    date_bin(make_interval(secs => p_bucket_seconds), captured_at, timestamptz '2000-01-01') as t,
    (array_agg(price_usd order by captured_at desc))[1] as price,
    (array_agg(market_cap order by captured_at desc))[1] as market_cap,
    (array_agg(volume_h1 order by captured_at desc))[1] as volume_h1,
    (array_agg(risk_score order by captured_at desc))[1] as risk_score,
    (array_agg(liquidity_usd order by captured_at desc))[1] as liquidity_usd
  from public.token_snapshots
  where token_id = p_token and captured_at >= p_since
  group by 1
  order by 1
  limit 1000
$$;
grant execute on function public.token_history(uuid, timestamptz, integer) to authenticated, service_role;

-- Raw recent series for the risk engine: ONE row per token (PostgREST caps at 1000 rows).
create or replace function public.token_recent_series(p_tokens uuid[], p_since timestamptz)
returns table (token_id uuid, ts timestamptz[], prices numeric[], liquidity numeric[], market_caps numeric[])
language sql stable as $$
  select
    s.token_id,
    array_agg(s.captured_at order by s.captured_at),
    array_agg(s.price_usd order by s.captured_at),
    array_agg(s.liquidity_usd order by s.captured_at),
    array_agg(s.market_cap order by s.captured_at)
  from public.token_snapshots s
  where s.token_id = any(p_tokens) and s.captured_at >= p_since
  group by s.token_id
$$;
revoke all on function public.token_recent_series(uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.token_recent_series(uuid[], timestamptz) to service_role;

create index if not exists alert_rules_position_idx on public.alert_rules (position_id) where position_id is not null;
