-- PeakAlert — initial schema
-- Run in Supabase: SQL Editor → paste → Run (or `supabase db push`).
--
-- Security model
--   * Every table has RLS enabled.
--   * Authenticated users can only SELECT their own rows (and shared market data).
--   * ALL writes go through Next.js API routes, which authenticate the user,
--     validate input + plan limits, and then write with the service-role key.
--     This prevents users from bypassing plan limits by calling PostgREST directly.
--   * The plan column can only be changed with the service role (future Stripe webhook).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.plan_tier as enum ('free', 'pro', 'premium');
exception when duplicate_object then null; end $$;

-- Keep in sync with src/lib/plans.ts (PLANS[...].maxTokens).
create or replace function public.plan_token_limit(p public.plan_tier)
returns integer language sql immutable as $$
  select case p when 'free' then 2 when 'pro' then 20 when 'premium' then 100 end
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan public.plan_tier not null default 'free',
  -- Billing (prepared for Stripe, not used yet)
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  subscription_status text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Tokens (shared market-data cache, one row per chain + address)
-- ---------------------------------------------------------------------------
create table if not exists public.tokens (
  id uuid primary key default gen_random_uuid(),
  chain_id text not null,
  address text not null,              -- EVM: lowercase. Solana: as-is (case sensitive)
  pair_address text,
  dex_id text,
  pair_url text,
  name text,
  symbol text,
  image_url text,
  price_usd numeric,
  price_native numeric,
  market_cap numeric,
  fdv numeric,
  liquidity_usd numeric,
  volume_m5 numeric,
  volume_h1 numeric,
  volume_h6 numeric,
  volume_h24 numeric,
  change_m5 numeric,
  change_h1 numeric,
  change_h6 numeric,
  change_h24 numeric,
  txns jsonb,
  pair_created_at timestamptz,
  -- Highest values PeakAlert has observed since it started tracking the token
  peak_price numeric,
  peak_market_cap numeric,
  peak_at timestamptz,
  data_updated_at timestamptz,        -- last successful fetch from the market API
  last_snapshot_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chain_id, address)
);

-- ---------------------------------------------------------------------------
-- Snapshots (our own price history — DexScreener has no historical API)
-- ---------------------------------------------------------------------------
create table if not exists public.token_snapshots (
  id bigint generated always as identity primary key,
  token_id uuid not null references public.tokens (id) on delete cascade,
  captured_at timestamptz not null default now(),
  price_usd numeric not null,
  market_cap numeric,
  liquidity_usd numeric,
  volume_h1 numeric,
  volume_h24 numeric
);
create index if not exists token_snapshots_token_time_idx
  on public.token_snapshots (token_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- Watchlist
-- ---------------------------------------------------------------------------
create table if not exists public.watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  token_id uuid not null references public.tokens (id) on delete cascade,
  added_price numeric,                -- price when the user started following (for "performance since added")
  created_at timestamptz not null default now(),
  primary key (user_id, token_id)
);
create index if not exists watchlist_token_idx on public.watchlist (token_id);

-- Defense in depth: the API checks the limit too, but the DB has the final word.
create or replace function public.enforce_watchlist_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan public.plan_tier;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('watchlist:' || new.user_id::text));
  select plan into v_plan from public.profiles where id = new.user_id;
  if v_plan is null then v_plan := 'free'; end if;
  select count(*) into v_count from public.watchlist where user_id = new.user_id;
  if v_count >= public.plan_token_limit(v_plan) then
    raise exception 'PLAN_TOKEN_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists watchlist_limit on public.watchlist;
create trigger watchlist_limit
  before insert on public.watchlist
  for each row execute function public.enforce_watchlist_limit();

-- ---------------------------------------------------------------------------
-- Portfolio positions
-- ---------------------------------------------------------------------------
create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_id uuid not null references public.tokens (id) on delete cascade,
  entry_price numeric not null check (entry_price > 0),
  invested_usd numeric not null check (invested_usd > 0),
  entry_at timestamptz not null default now(),
  exit_price numeric check (exit_price > 0),
  exit_at timestamptz,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((exit_price is null) = (exit_at is null))
);
create index if not exists positions_user_idx on public.positions (user_id, created_at desc);
create index if not exists positions_token_idx on public.positions (token_id);

-- ---------------------------------------------------------------------------
-- Alerts
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.alert_type as enum (
    'drawdown_from_peak', 'volume_drop', 'momentum_loss', 'market_cap_cross', 'price_spike'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_id uuid not null references public.tokens (id) on delete cascade,
  type public.alert_type not null,
  params jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  cooldown_minutes integer not null default 60 check (cooldown_minutes between 5 and 1440),
  -- Edge-trigger state: a rule fires once, then must re-arm (condition clears / new peak)
  armed boolean not null default true,
  state jsonb not null default '{}'::jsonb,
  version integer not null default 0,     -- optimistic lock against double firing
  last_triggered_at timestamptz,
  last_evaluated_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists alert_rules_token_idx on public.alert_rules (token_id) where enabled;
create index if not exists alert_rules_user_idx on public.alert_rules (user_id);

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rule_id uuid references public.alert_rules (id) on delete set null,
  token_id uuid not null references public.tokens (id) on delete cascade,
  type public.alert_type not null,
  title text not null,
  message text not null,
  price_usd numeric,
  market_cap numeric,
  metrics jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  notified_at timestamptz,
  notify_error text,
  created_at timestamptz not null default now()
);
create index if not exists alert_events_user_time_idx on public.alert_events (user_id, created_at desc);

-- Paper Exit: what would have happened if the user had sold when the alert fired
create table if not exists public.paper_exits (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.alert_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  token_id uuid not null references public.tokens (id) on delete cascade,
  position_id uuid references public.positions (id) on delete set null,
  alert_price numeric not null,
  quantity numeric,                -- tokens held in the open position at alert time (if any)
  entry_price numeric,
  -- {"1h": {"price": n, "at": iso}, "24h": {...}, "7d": {...}} filled as time passes
  checkpoints jsonb not null default '{}'::jsonb,
  max_price_after numeric,
  min_price_after numeric,
  last_price numeric,
  last_checked_at timestamptz,
  closed boolean not null default false,   -- tracking stops after 7 days
  created_at timestamptz not null default now()
);
create index if not exists paper_exits_open_idx on public.paper_exits (token_id) where not closed;
create index if not exists paper_exits_user_idx on public.paper_exits (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Web Push subscriptions
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.tokens enable row level security;
alter table public.token_snapshots enable row level security;
alter table public.watchlist enable row level security;
alter table public.positions enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alert_events enable row level security;
alter table public.paper_exits enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid());

drop policy if exists "market data readable" on public.tokens;
create policy "market data readable" on public.tokens for select to authenticated using (true);

drop policy if exists "snapshots readable" on public.token_snapshots;
create policy "snapshots readable" on public.token_snapshots for select to authenticated using (true);

drop policy if exists "own watchlist" on public.watchlist;
create policy "own watchlist" on public.watchlist for select to authenticated using (user_id = auth.uid());

drop policy if exists "own positions" on public.positions;
create policy "own positions" on public.positions for select to authenticated using (user_id = auth.uid());

drop policy if exists "own rules" on public.alert_rules;
create policy "own rules" on public.alert_rules for select to authenticated using (user_id = auth.uid());

drop policy if exists "own events" on public.alert_events;
create policy "own events" on public.alert_events for select to authenticated using (user_id = auth.uid());

drop policy if exists "own paper exits" on public.paper_exits;
create policy "own paper exits" on public.paper_exits for select to authenticated using (user_id = auth.uid());

drop policy if exists "own push subs" on public.push_subscriptions;
create policy "own push subs" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Helpers used by the server (service role only)
-- ---------------------------------------------------------------------------

-- Tokens that the background job must refresh
create or replace function public.tracked_token_ids()
returns setof uuid language sql stable as $$
  select token_id from public.watchlist
  union
  select token_id from public.alert_rules where enabled
  union
  select token_id from public.paper_exits where not closed
$$;

-- Snapshot retention (called by the cron job)
create or replace function public.prune_snapshots(keep_days integer default 7)
returns integer language plpgsql as $$
declare n integer;
begin
  delete from public.token_snapshots where captured_at < now() - make_interval(days => keep_days);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.tracked_token_ids() from public, anon, authenticated;
revoke all on function public.prune_snapshots(integer) from public, anon, authenticated;
grant execute on function public.tracked_token_ids() to service_role;
grant execute on function public.prune_snapshots(integer) to service_role;

-- Bucketed price history for charts (PostgREST returns max 1000 rows per request,
-- so we downsample in SQL). SECURITY INVOKER → RLS still applies.
create or replace function public.token_history(p_token uuid, p_since timestamptz, p_bucket_seconds integer)
returns table (t timestamptz, price numeric, market_cap numeric, volume_h1 numeric)
language sql stable as $$
  select
    date_bin(make_interval(secs => p_bucket_seconds), captured_at, timestamptz '2000-01-01') as t,
    (array_agg(price_usd order by captured_at desc))[1] as price,
    (array_agg(market_cap order by captured_at desc))[1] as market_cap,
    (array_agg(volume_h1 order by captured_at desc))[1] as volume_h1
  from public.token_snapshots
  where token_id = p_token and captured_at >= p_since
  group by 1
  order by 1
  limit 2000
$$;
grant execute on function public.token_history(uuid, timestamptz, integer) to authenticated, service_role;

-- Sparklines for many tokens in one call (dashboard). One row per token
-- (PostgREST caps responses at 1000 rows, so we return arrays).
drop function if exists public.token_sparklines(uuid[], timestamptz, integer);
create or replace function public.token_sparklines(p_tokens uuid[], p_since timestamptz, p_bucket_seconds integer)
returns table (token_id uuid, prices numeric[])
language sql stable as $$
  with b as (
    select
      s.token_id,
      date_bin(make_interval(secs => p_bucket_seconds), s.captured_at, timestamptz '2000-01-01') as t,
      (array_agg(s.price_usd order by s.captured_at desc))[1] as price
    from public.token_snapshots s
    where s.token_id = any(p_tokens) and s.captured_at >= p_since
    group by 1, 2
  )
  select token_id, array_agg(price order by t) from b group by token_id
$$;
grant execute on function public.token_sparklines(uuid[], timestamptz, integer) to authenticated, service_role;
