"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ExternalLink, Flame, Plus, Radar, ShieldAlert, Trash2, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { AddTokenDialog } from "@/components/add-token-dialog";
import { SeverityBadge } from "@/components/alert-explanation";
import { PriceChart } from "@/components/price-chart";
import { RiskBadge, RISK_DISCLAIMER } from "@/components/risk";
import { ChainTag, DataAge, Sparkline, TokenAvatar } from "@/components/token-bits";
import { Badge, Button, Delta, EmptyState, ErrorNote, InfoNote, Panel, PanelHeader, Segmented, Skeleton, cn } from "@/components/ui";
import { api, ApiError, fetcher } from "@/lib/client/api";
import type { EventDTO, RuleDTO, TokenDTO, WatchlistResponse } from "@/lib/client/types";
import { formatPrice, formatUsdCompact, timeAgo, toNum } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";
import { pickMsg } from "@/lib/i18n";

function pctBetween(from: unknown, to: unknown): number | null {
  const a = toNum(from);
  const b = toNum(to);
  if (a == null || b == null || a <= 0) return null;
  return (b / a - 1) * 100;
}

export default function DashboardPage() {
  const router = useRouter();
  const { t: tr, p: pl, locale } = useI18n();
  const [adding, setAdding] = useState(false);
  const { data, error, isLoading, mutate } = useSWR<WatchlistResponse>("/api/watchlist", fetcher, {
    refreshInterval: 30_000,
    keepPreviousData: true,
  });
  const { data: rules } = useSWR<{ rules: RuleDTO[] }>("/api/alerts/rules", fetcher);
  const { data: events } = useSWR<{ events: EventDTO[] }>("/api/alerts/events?limit=6", fetcher, { refreshInterval: 30_000 });
  const { data: market } = useSWR<{ demo: boolean; sol: { price_usd: number | null; change_h24: number | null } | null; fetchedAt: string }>(
    "/api/market",
    fetcher,
    { refreshInterval: 60_000 },
  );

  const tokens = useMemo(() => data?.tokens ?? [], [data]);
  const lastUpdate = tokens.map((t) => t.data_updated_at).filter(Boolean).sort().at(-1);
  const atLimit = data ? tokens.length >= data.limit : false;
  const nowMs = data ? Date.parse(data.serverTime) : 0;
  const alerts24h = events?.events.filter((e) => nowMs - Date.parse(e.created_at) < 86_400_000).length ?? 0;

  const scored = tokens.filter((t) => t.risk_score != null);
  const avgRisk = scored.length ? Math.round(scored.reduce((s, t) => s + (t.risk_score ?? 0), 0) / scored.length) : null;
  const highRisk = scored.filter((t) => (t.risk_score ?? 0) > 60).length;
  const byRisk = [...scored].sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0)).slice(0, 4);
  const byMomentum = tokens.filter((t) => t.momentum_score != null).sort((a, b) => (b.momentum_score ?? 0) - (a.momentum_score ?? 0)).slice(0, 4);

  async function remove(t: TokenDTO) {
    if (!confirm(tr(`Stop following ${t.symbol}? Your alerts for this token will also be deleted.`, `¿Dejar de seguir ${t.symbol}? Se eliminarán también tus alertas de este token.`))) return;
    try {
      await api(`/api/watchlist/${t.id}`, { method: "DELETE" });
      mutate();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : tr("Couldn't remove", "No se pudo eliminar"));
    }
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        sub={<DataAge at={lastUpdate} />}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)} disabled={atLimit} title={atLimit ? tr("Plan limit reached", "Límite del plan alcanzado") : undefined}>
            <Plus size={15} /> {tr("Add token", "Agregar token")}
          </Button>
        }
      />

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        <Stat label={tr("Tokens tracked", "Tokens monitoreados")} value={data ? `${tokens.length} / ${data.limit}` : null} />
        <Stat label={tr("Average exhaustion risk", "Riesgo medio de agotamiento")} value={data ? (avgRisk == null ? "—" : String(avgRisk)) : null} badge={avgRisk != null ? <RiskBadge score={avgRisk} size="sm" /> : null} />
        <Stat label={tr("At elevated risk (>60)", "En riesgo elevado (>60)")} value={data ? String(highRisk) : null} tone={highRisk > 0 ? "text-orange" : undefined} />
        <Stat
          label={tr("Alerts in 24h", "Alertas en 24 h")}
          value={events ? String(alerts24h) : null}
          sub={rules ? tr(`${rules.rules.filter((r) => r.enabled).length} active rules`, `${rules.rules.filter((r) => r.enabled).length} reglas activas`) : undefined}
        />
      </div>

      {atLimit && (
        <div className="mb-4">
          <InfoNote>
            {tr(`You've reached your plan's limit of ${data!.limit} tokens.`, `Alcanzaste el límite de ${data!.limit} tokens de tu plan.`)}{" "}
            <Link href="/pricing" className="text-text underline underline-offset-2">{tr("See plans", "Ver planes")}</Link>
          </InfoNote>
        </div>
      )}
      {data?.refreshError && <div className="mb-4"><InfoNote tone="warn">{pickMsg(data.refreshError, locale)}</InfoNote></div>}
      {error && !data && <ErrorNote>{error.message}</ErrorNote>}

      {isLoading && !data ? (
        <Skeleton className="h-72 w-full" />
      ) : tokens.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Radar size={28} strokeWidth={1.5} />}
            title={tr("You're not tracking any tokens yet", "Aún no monitoreas ningún token")}
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus size={15} /> {tr("Add by contract address", "Agregar por contract address")}
              </Button>
            }
          >
            {tr(
              "Paste a memecoin's contract address. PeakAlert will start recording its price, computing its exhaustion risk and watching your alerts.",
              "Pega la dirección del contrato de un memecoin. PeakAlert empezará a registrar su precio, calcular su riesgo de agotamiento y vigilar tus alertas.",
            )}
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-5">
          {/* Chart + market */}
          <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
            <ChartPanel tokens={tokens} />
            <MarketSummary tokens={tokens} market={market} />
          </div>

          {/* Rankings + alerts */}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <RankPanel
              title={tr("Highest exhaustion risk", "Mayor riesgo de agotamiento")}
              icon={<ShieldAlert size={14} className="text-orange" />}
              tokens={byRisk}
              empty={tr("Calculated with every update.", "Se calcula con cada actualización.")}
              right={(t) => <RiskBadge score={t.risk_score} coverage={toNum(t.risk_coverage)} size="sm" />}
            />
            <RankPanel
              title={tr("Strongest momentum", "Mayor momentum")}
              icon={<TrendingUp size={14} className="text-up" />}
              tokens={byMomentum}
              empty={tr("No momentum data yet.", "Sin datos de momentum todavía.")}
              right={(t) => (
                <span className="num text-xs">
                  <span className="text-text">{t.momentum_score}</span>
                  <span className="text-faint"> · </span>
                  <Delta value={toNum(t.change_h1)} digits={1} />
                </span>
              )}
            />
            <Panel className="md:col-span-2 xl:col-span-1">
              <PanelHeader
                title={tr("Recent alerts", "Alertas recientes")}
                actions={<Link href="/alerts?tab=history" className="text-xs text-muted hover:text-text">{tr("View all", "Ver todo")}</Link>}
              />
              {!events ? (
                <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
              ) : events.events.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted">
                  {tr("No alerts yet.", "Sin alertas todavía.")}{" "}
                  {(rules?.rules.length ?? 0) === 0 && (
                    <Link href="/alerts" className="text-text underline underline-offset-2">{tr("Create your first alert", "Crea tu primera alerta")}</Link>
                  )}
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {events.events.slice(0, 5).map((e) => (
                    <li key={e.id} className="rise">
                      <Link href="/alerts?tab=history" className="block px-4 py-2.5 hover:bg-panel-2/50">
                        <div className="flex items-start gap-2">
                          <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", e.read_at ? "bg-line-strong" : "bg-down")} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px]">{e.title}</p>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-faint">
                              <SeverityBadge severity={e.severity} /> {timeAgo(e.created_at, undefined, locale)}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          {/* Watchlist */}
          <Panel className="overflow-hidden">
            <PanelHeader title="Watchlist" sub={tr("Click a token to see its analysis, chart and alerts.", "Haz clic en un token para ver su análisis, gráfica y alertas.")} />
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                    <th className="px-4 py-2.5 font-medium">Token</th>
                    <th className="px-3 py-2.5 text-right font-medium">{tr("Price", "Precio")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">1h</th>
                    <th className="px-3 py-2.5 text-right font-medium">24h</th>
                    <th className="px-3 py-2.5 text-right font-medium" title={tr("Distance to the high recorded by PeakAlert", "Distancia al máximo registrado por PeakAlert")}>{tr("From high", "Desde máx.")}</th>
                    <th className="px-3 py-2.5 text-right font-medium">Market cap</th>
                    <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">Vol. 24h</th>
                    <th className="hidden px-3 py-2.5 text-right font-medium lg:table-cell">{tr("Liquidity", "Liquidez")}</th>
                    <th className="px-3 py-2.5 text-right font-medium" title={tr("Momentum exhaustion risk (0–100)", "Riesgo de agotamiento del impulso (0–100)")}>{tr("Risk", "Riesgo")}</th>
                    <th className="hidden px-3 py-2.5 font-medium xl:table-cell">24h</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr key={t.id} onClick={() => router.push(`/tokens/${t.id}`)} className="group cursor-pointer border-b border-line last:border-0 hover:bg-panel-2/60">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <TokenAvatar src={t.image_url} symbol={t.symbol} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{t.symbol}</span>
                              {t.last_error && <Badge tone="warn">{tr("not updating", "sin actualizar")}</Badge>}
                            </div>
                            <ChainTag chain={t.chain_id} />
                          </div>
                        </div>
                      </td>
                      <td className="num px-3 py-2.5 text-right">{formatPrice(toNum(t.price_usd))}</td>
                      <td className="px-3 py-2.5 text-right"><Delta value={toNum(t.change_h1)} /></td>
                      <td className="px-3 py-2.5 text-right"><Delta value={toNum(t.change_h24)} /></td>
                      <td className="px-3 py-2.5 text-right"><Delta value={pctBetween(t.peak_price, t.price_usd)} /></td>
                      <td className="num px-3 py-2.5 text-right">{formatUsdCompact(toNum(t.market_cap))}</td>
                      <td className="num hidden px-3 py-2.5 text-right text-muted lg:table-cell">{formatUsdCompact(toNum(t.volume_h24))}</td>
                      <td className="num hidden px-3 py-2.5 text-right text-muted lg:table-cell">{formatUsdCompact(toNum(t.liquidity_usd))}</td>
                      <td className="px-3 py-2.5 text-right"><RiskBadge score={t.risk_score} coverage={toNum(t.risk_coverage)} /></td>
                      <td className="hidden px-3 py-2.5 xl:table-cell"><Sparkline data={t.sparkline ?? []} /></td>
                      <td className="pr-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(t);
                          }}
                          className="rounded p-1.5 text-faint opacity-0 hover:bg-panel hover:text-down focus:opacity-100 group-hover:opacity-100"
                          aria-label={`Dejar de seguir ${t.symbol}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {tokens.map((t) => (
                <li key={t.id}>
                  <Link href={`/tokens/${t.id}`} className="block px-4 py-3 active:bg-panel-2">
                    <div className="flex items-center gap-3">
                      <TokenAvatar src={t.image_url} symbol={t.symbol} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{t.symbol}</span>
                          <ChainTag chain={t.chain_id} />
                        </div>
                        <p className="num text-xs text-muted">MC {formatUsdCompact(toNum(t.market_cap))} · Liq {formatUsdCompact(toNum(t.liquidity_usd))}</p>
                      </div>
                      <div className="text-right">
                        <p className="num text-sm">{formatPrice(toNum(t.price_usd))}</p>
                        <Delta value={toNum(t.change_h24)} className="text-xs" />
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-faint">{tr("Risk", "Riesgo")} <RiskBadge score={t.risk_score} coverage={toNum(t.risk_coverage)} size="sm" /></span>
                      <span className="text-faint">{tr("From high", "Desde máx.")} <Delta value={pctBetween(t.peak_price, t.price_usd)} /></span>
                      <Sparkline data={t.sparkline ?? []} width={64} height={20} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}

      <p className="mt-6 text-[11px] leading-relaxed text-faint">
        {pl(RISK_DISCLAIMER)}{" "}
        {tr(
          "Market data: DexScreener (most liquid pair). “From high” uses the high recorded by PeakAlert.",
          "Datos de mercado: DexScreener (par con mayor liquidez). “Desde máx.” usa el máximo que PeakAlert ha registrado.",
        )}{" "}
        <a href="https://dexscreener.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-muted">dexscreener.com <ExternalLink size={10} /></a>
      </p>

      <AddTokenDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false);
          mutate();
        }}
      />
    </>
  );
}

function Stat({ label, value, sub, badge, tone }: { label: string; value: string | null; sub?: string; badge?: React.ReactNode; tone?: string }) {
  return (
    <div className="bg-panel px-4 py-3">
      <p className="text-[11px] text-faint">{label}</p>
      {value == null ? (
        <Skeleton className="mt-1.5 h-5 w-16" />
      ) : (
        <div className="mt-1 flex items-center gap-2">
          <p className={cn("num text-lg", tone)}>{value}</p>
          {badge}
        </div>
      )}
      {sub && <p className="mt-0.5 text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

function RankPanel({ title, icon, tokens, right, empty }: { title: string; icon: React.ReactNode; tokens: TokenDTO[]; right: (t: TokenDTO) => React.ReactNode; empty: string }) {
  return (
    <Panel>
      <PanelHeader title={<span className="flex items-center gap-1.5">{icon} {title}</span>} />
      {tokens.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {tokens.map((t) => (
            <li key={t.id} className="rise">
              <Link href={`/tokens/${t.id}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-panel-2/50">
                <TokenAvatar src={t.image_url} symbol={t.symbol} size={24} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{t.symbol}</p>
                  <p className="num text-[11px] text-faint">{formatUsdCompact(toNum(t.market_cap))}</p>
                </div>
                {right(t)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MarketSummary({ tokens, market }: { tokens: TokenDTO[]; market?: { demo: boolean; sol: { price_usd: number | null; change_h24: number | null } | null } }) {
  const changes = tokens.map((t) => toNum(t.change_h24)).filter((v): v is number => v != null);
  const up = changes.filter((c) => c > 0).length;
  const avg = changes.length ? changes.reduce((s, c) => s + c, 0) / changes.length : null;
  const vol = tokens.reduce((s, t) => s + (toNum(t.volume_h24) ?? 0), 0);
  const mc = tokens.reduce((s, t) => s + (toNum(t.market_cap) ?? 0), 0);
  const { t: tr } = useI18n();
  return (
    <Panel>
      <PanelHeader title={<span className="flex items-center gap-1.5"><Flame size={14} className="text-warn" /> {tr("Market summary", "Resumen del mercado")}</span>} />
      <dl className="space-y-3 p-4 text-sm">
        <Row k="SOL" v={market?.sol ? <span className="num">{formatPrice(market.sol.price_usd)} <Delta value={market.sol.change_h24} digits={1} className="text-xs" /></span> : market?.demo ? <span className="text-xs text-faint">{tr("offline", "sin conexión")}</span> : "—"} />
        <Row k={tr("Your watchlist 24h (avg)", "Tu watchlist 24h (media)")} v={<Delta value={avg} digits={1} />} />
        <Row k={tr("Up / down", "Subiendo / bajando")} v={<span className="num"><span className="text-up">{up}</span> / <span className="text-down">{changes.length - up}</span></span>} />
        <Row k={tr("Total market cap", "Market cap total")} v={<span className="num">{formatUsdCompact(mc)}</span>} />
        <Row k={tr("Total 24h volume", "Volumen 24h total")} v={<span className="num">{formatUsdCompact(vol)}</span>} />
      </dl>
      {changes.length > 0 && (
        <div className="px-4 pb-4">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-down/40">
            <div className="h-full bg-up transition-[width] duration-700" style={{ width: `${(up / changes.length) * 100}%` }} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

type Mode = "price" | "mcap";

function ChartPanel({ tokens }: { tokens: TokenDTO[] }) {
  const { t: tr } = useI18n();
  const [selected, setSelected] = useState<string>(tokens[0]?.id);
  const [mode, setMode] = useState<Mode>("price");
  const id = tokens.some((t) => t.id === selected) ? selected : tokens[0]?.id;
  const { data } = useSWR<{ history: { t: string; price: number; market_cap: number | null }[] }>(id ? `/api/tokens/${id}?range=24h` : null, fetcher, {
    refreshInterval: 60_000,
    keepPreviousData: true,
  });
  const points = useMemo(
    () =>
      (data?.history ?? [])
        .map((h) => ({ t: h.t, price: mode === "price" ? Number(h.price) : Number(h.market_cap) }))
        .filter((p) => Number.isFinite(p.price) && p.price > 0),
    [data, mode],
  );
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex max-w-full gap-1 overflow-x-auto">
          {tokens.slice(0, 8).map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={cn("rounded px-2 py-1 text-xs whitespace-nowrap", id === t.id ? "bg-panel-2 text-text ring-1 ring-line-strong" : "text-muted hover:text-text")}
            >
              {t.symbol}
            </button>
          ))}
        </div>
        <Segmented<Mode> value={mode} onChange={setMode} options={[{ value: "price", label: tr("Price", "Precio") }, { value: "mcap", label: "Market cap" }]} />
      </div>
      <div className="p-2">
        {points.length < 2 ? (
          <EmptyState title={tr("Collecting history", "Recopilando historial")}>
            {tr("The chart fills with the prices PeakAlert records (≈ 1 per minute).", "La gráfica se llena con los precios que PeakAlert registra (≈ 1 por minuto).")}
          </EmptyState>
        ) : (
          <PriceChart points={points} height={260} format={mode === "price" ? formatPrice : formatUsdCompact} />
        )}
      </div>
      <p className="border-t border-line px-4 py-2 text-[11px] text-faint">{tr("Last 24h · history recorded by PeakAlert", "Últimas 24 h · historial registrado por PeakAlert")}</p>
    </Panel>
  );
}
