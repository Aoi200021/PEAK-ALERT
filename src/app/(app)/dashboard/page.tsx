"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ExternalLink, Plus, Radar, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { AddTokenDialog } from "@/components/add-token-dialog";
import { ChainTag, DataAge, Sparkline, TokenAvatar } from "@/components/token-bits";
import { Badge, Button, Delta, EmptyState, ErrorNote, InfoNote, Panel, Skeleton, cn } from "@/components/ui";
import { api, ApiError, fetcher } from "@/lib/client/api";
import type { EventDTO, RuleDTO, TokenDTO, WatchlistResponse } from "@/lib/client/types";
import { formatPrice, formatUsdCompact, timeAgo, toNum } from "@/lib/format";

function pctBetween(from: unknown, to: unknown): number | null {
  const a = toNum(from);
  const b = toNum(to);
  if (a == null || b == null || a <= 0) return null;
  return (b / a - 1) * 100;
}

export default function DashboardPage() {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const { data, error, isLoading, mutate } = useSWR<WatchlistResponse>("/api/watchlist", fetcher, {
    refreshInterval: 30_000,
    keepPreviousData: true,
  });
  const { data: rules } = useSWR<{ rules: RuleDTO[] }>("/api/alerts/rules", fetcher);
  const { data: events } = useSWR<{ events: EventDTO[] }>("/api/alerts/events?limit=5", fetcher, {
    refreshInterval: 30_000,
  });

  const tokens = data?.tokens ?? [];
  const lastUpdate = tokens
    .map((t) => t.data_updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const atLimit = data ? tokens.length >= data.limit : false;
  const activeRules = rules?.rules.filter((r) => r.enabled).length ?? 0;
  const nowMs = data ? Date.parse(data.serverTime) : 0;
  const alerts24h = events?.events.filter((e) => nowMs - Date.parse(e.created_at) < 86_400_000).length ?? 0;

  async function remove(t: TokenDTO) {
    if (!confirm(`¿Dejar de seguir ${t.symbol}? Se eliminarán también tus alertas de este token.`)) return;
    try {
      await api(`/api/watchlist/${t.id}`, { method: "DELETE" });
      mutate();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        sub={<DataAge at={lastUpdate} />}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)} disabled={atLimit} title={atLimit ? "Límite del plan alcanzado" : undefined}>
            <Plus size={15} /> Agregar token
          </Button>
        }
      />

      {/* Summary */}
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        <Stat label="Tokens seguidos" value={data ? `${tokens.length} / ${data.limit}` : null} />
        <Stat label="Alertas activas" value={rules ? String(activeRules) : null} />
        <Stat label="Alertas recientes (24 h)" value={events ? String(alerts24h) : null} />
        <Stat
          label="Última alerta"
          value={events ? (events.events[0] ? timeAgo(events.events[0].created_at) : "—") : null}
        />
      </div>

      {atLimit && (
        <div className="mb-4">
          <InfoNote>
            Alcanzaste el límite de {data!.limit} tokens de tu plan. <Link href="/settings" className="text-text underline underline-offset-2">Ver planes</Link>
          </InfoNote>
        </div>
      )}
      {data?.refreshError && (
        <div className="mb-4">
          <InfoNote tone="warn">{data.refreshError}</InfoNote>
        </div>
      )}
      {error && !data && <ErrorNote>{error.message}</ErrorNote>}

      <div className="grid gap-5 2xl:grid-cols-[1fr_320px]">
        <Panel className="overflow-hidden">
          {isLoading && !data ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : tokens.length === 0 ? (
            <EmptyState
              icon={<Radar size={28} strokeWidth={1.5} />}
              title="Aún no sigues ningún token"
              action={
                <Button variant="primary" onClick={() => setAdding(true)}>
                  <Plus size={15} /> Agregar por contract address
                </Button>
              }
            >
              Pega la dirección del contrato de un memecoin para empezar a registrar su precio y configurar alertas.
            </EmptyState>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                      <th className="px-4 py-2.5 font-medium">Token</th>
                      <th className="px-3 py-2.5 text-right font-medium">Precio</th>
                      <th className="px-3 py-2.5 text-right font-medium">1h</th>
                      <th className="px-3 py-2.5 text-right font-medium">24h</th>
                      <th className="px-3 py-2.5 text-right font-medium" title="Variación desde que empezaste a seguirlo">Desde alta</th>
                      <th className="px-3 py-2.5 text-right font-medium" title="Distancia al máximo registrado por PeakAlert">Desde máx.</th>
                      <th className="px-3 py-2.5 text-right font-medium">Market cap</th>
                      <th className="px-3 py-2.5 text-right font-medium">Vol. 24h</th>
                      <th className="px-3 py-2.5 text-right font-medium">Liquidez</th>
                      <th className="px-3 py-2.5 font-medium">24h</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {tokens.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => router.push(`/tokens/${t.id}`)}
                        className="group cursor-pointer border-b border-line last:border-0 hover:bg-panel-2/60"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <TokenAvatar src={t.image_url} symbol={t.symbol} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium">{t.symbol}</span>
                                {t.last_error && <Badge tone="warn">sin actualizar</Badge>}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <ChainTag chain={t.chain_id} />
                                <span className="max-w-[120px] truncate text-xs text-faint">{t.name}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="num px-3 py-2.5 text-right">{formatPrice(toNum(t.price_usd))}</td>
                        <td className="px-3 py-2.5 text-right"><Delta value={toNum(t.change_h1)} /></td>
                        <td className="px-3 py-2.5 text-right"><Delta value={toNum(t.change_h24)} /></td>
                        <td className="px-3 py-2.5 text-right"><Delta value={pctBetween(t.added_price, t.price_usd)} /></td>
                        <td className="px-3 py-2.5 text-right"><Delta value={pctBetween(t.peak_price, t.price_usd)} /></td>
                        <td className="num px-3 py-2.5 text-right">{formatUsdCompact(toNum(t.market_cap))}</td>
                        <td className="num px-3 py-2.5 text-right text-muted">{formatUsdCompact(toNum(t.volume_h24))}</td>
                        <td className="num px-3 py-2.5 text-right text-muted">{formatUsdCompact(toNum(t.liquidity_usd))}</td>
                        <td className="px-3 py-2.5"><Sparkline data={t.sparkline ?? []} /></td>
                        <td className="pr-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              remove(t);
                            }}
                            className="rounded p-1.5 text-faint opacity-0 hover:bg-panel hover:text-down group-hover:opacity-100 focus:opacity-100"
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

              {/* Mobile cards */}
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
                          <p className="num text-xs text-muted">MC {formatUsdCompact(toNum(t.market_cap))} · Vol {formatUsdCompact(toNum(t.volume_h24))}</p>
                        </div>
                        <div className="text-right">
                          <p className="num text-sm">{formatPrice(toNum(t.price_usd))}</p>
                          <Delta value={toNum(t.change_h24)} className="text-xs" />
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-faint">
                          Desde máx. <Delta value={pctBetween(t.peak_price, t.price_usd)} />
                        </span>
                        <span className="text-faint">
                          Desde alta <Delta value={pctBetween(t.added_price, t.price_usd)} />
                        </span>
                        <Sparkline data={t.sparkline ?? []} width={64} height={20} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        {/* Recent alerts */}
        <Panel className="h-fit">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-medium">Alertas recientes</h2>
            <Link href="/alerts?tab=history" className="text-xs text-muted hover:text-text">Ver todo</Link>
          </div>
          {!events ? (
            <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          ) : events.events.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted">
              Sin alertas todavía. {activeRules === 0 && <><br /><Link href="/alerts" className="text-text underline underline-offset-2">Crea tu primera alerta</Link></>}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {events.events.map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <Link href={e.token ? `/tokens/${e.token.id}` : "/alerts"} className="block">
                    <div className="flex items-start gap-2">
                      <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", e.read_at ? "bg-line-strong" : "bg-down")} />
                      <div className="min-w-0">
                        <p className="text-[13px] leading-snug">{e.title}</p>
                        <p className="mt-0.5 text-[11px] text-faint">{timeAgo(e.created_at)} · {formatPrice(toNum(e.price_usd))}</p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-faint">
        Datos de mercado: DexScreener (par con mayor liquidez). &ldquo;Desde máx.&rdquo; usa el máximo que PeakAlert ha registrado desde
        que se sigue el token, no el máximo histórico. <a href="https://dexscreener.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-muted">dexscreener.com <ExternalLink size={10} /></a>
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

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-panel px-4 py-3">
      <p className="text-[11px] text-faint">{label}</p>
      {value == null ? <Skeleton className="mt-1.5 h-5 w-16" /> : <p className="num mt-1 text-lg">{value}</p>}
    </div>
  );
}
