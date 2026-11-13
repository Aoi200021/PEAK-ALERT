"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { BriefcaseBusiness, Lock, Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { ClosePositionForm, NewPositionForm } from "@/components/position-forms";
import { ChainTag, TokenAvatar } from "@/components/token-bits";
import { Badge, Button, Delta, EmptyState, ErrorNote, Field, InfoNote, Modal, Panel, Segmented, Select, Skeleton } from "@/components/ui";
import { api, fetcher } from "@/lib/client/api";
import type { MeResponse, PositionDTO, WatchlistResponse } from "@/lib/client/types";
import { formatDateTime, formatPrice, formatUsd, timeAgo, toNum } from "@/lib/format";
import { positionPnl } from "@/lib/portfolio";
import { protectionSummary } from "@/lib/protection";
import { RiskBadge } from "@/components/risk";

type Filter = "open" | "closed" | "all";

export default function PortfolioPage() {
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);
  if (me && !me.plan.portfolio) {
    return (
      <>
        <PageHeader title="Profit Protection" />
        <Panel>
          <EmptyState icon={<Lock size={24} strokeWidth={1.5} />} title="Profit Protection está disponible en Pro y Premium" action={<Link href="/pricing"><Button variant="primary">Ver planes</Button></Link>}>
            Registra tu entrada (precio o market cap) y monto invertido para ver tu ROI, el beneficio máximo que llegaste a tener, cuánto has
            devuelto y alertas de trailing stop.
          </EmptyState>
        </Panel>
      </>
    );
  }
  return <PortfolioView />;
}

function PortfolioView() {
  // Watchlist refresh keeps prices fresh for tokens you follow.
  const { data: wl } = useSWR<WatchlistResponse>("/api/watchlist", fetcher, { refreshInterval: 30_000 });
  const { data, error, isLoading, mutate } = useSWR<{ positions: PositionDTO[] }>("/api/positions", fetcher, { refreshInterval: 30_000 });
  const [filter, setFilter] = useState<Filter>("open");
  const [creating, setCreating] = useState(false);
  const [tokenId, setTokenId] = useState("");
  const [closing, setClosing] = useState<PositionDTO | null>(null);

  const positions = data?.positions ?? [];
  const rows = positions.map((p) => {
    const pnl = positionPnl(p, p.token?.price_usd);
    const entry = toNum(p.entry_price);
    const prot =
      entry && !pnl.closed ? protectionSummary(entry, toNum(p.invested_usd) ?? 0, toNum(p.peak_price) ?? entry, toNum(p.token?.price_usd)) : null;
    return { p, ...pnl, prot };
  });
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "open" ? !r.closed : r.closed));

  const open = rows.filter((r) => !r.closed);
  const openInvested = open.reduce((s, r) => s + (toNum(r.p.invested_usd) ?? 0), 0);
  const openValue = open.every((r) => r.value != null) ? open.reduce((s, r) => s + (r.value ?? 0), 0) : null;
  const realized = rows.filter((r) => r.closed).reduce((s, r) => s + (r.pnl ?? 0), 0);
  const unrealized = openValue != null ? openValue - openInvested : null;

  async function remove(p: PositionDTO) {
    if (!confirm("¿Eliminar este registro?")) return;
    await api(`/api/positions/${p.id}`, { method: "DELETE" }).catch(() => null);
    mutate();
  }
  async function reopen(p: PositionDTO) {
    await api(`/api/positions/${p.id}`, { method: "PATCH", json: { exitPrice: null } }).catch(() => null);
    mutate();
  }

  const selectedToken = wl?.tokens.find((t) => t.id === tokenId);

  return (
    <>
      <PageHeader
        title="Profit Protection"
        sub="Tus posiciones, el beneficio máximo que alcanzaron y cuánto has devuelto. Estimaciones sin comisiones, slippage ni impuestos."
        actions={<Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> Registrar posición</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        <Stat label="Invertido (abiertas)" value={formatUsd(openInvested)} />
        <Stat label="Valor estimado (abiertas)" value={formatUsd(openValue)} />
        <Stat label="P&L no realizado" value={unrealized == null ? "—" : `${unrealized >= 0 ? "+" : ""}${formatUsd(unrealized)}`} tone={unrealized} />
        <Stat label="P&L realizado" value={`${realized >= 0 ? "+" : ""}${formatUsd(realized)}`} tone={realized} />
      </div>

      {error && <ErrorNote>{error.message}</ErrorNote>}

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: `Abiertas (${open.length})` },
              { value: "closed", label: `Cerradas (${rows.length - open.length})` },
              { value: "all", label: "Todas" },
            ]}
          />
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : shown.length === 0 ? (
          <EmptyState icon={<BriefcaseBusiness size={26} strokeWidth={1.5} />} title="Sin posiciones">
            Registra una compra para seguir su rendimiento.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                  <th className="px-4 py-2.5 font-medium">Token</th>
                  <th className="px-3 py-2.5 text-right font-medium">Invertido</th>
                  <th className="px-3 py-2.5 text-right font-medium">Entrada</th>
                  <th className="px-3 py-2.5 text-right font-medium">Actual / Venta</th>
                  <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                  <th className="px-3 py-2.5 text-right font-medium">P&amp;L</th>
                  <th className="px-3 py-2.5 text-right font-medium">ROI</th>
                  <th className="px-3 py-2.5 text-right font-medium" title="Beneficio máximo no realizado desde la entrada">Máx. benef.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Desde máx.</th>
                  <th className="px-3 py-2.5 text-right font-medium">Riesgo</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {shown.map(({ p, closed, value, pnl, pnlPct, prot }) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/tokens/${p.token_id}`} className="flex items-center gap-2.5">
                        <TokenAvatar src={p.token?.image_url} symbol={p.token?.symbol} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{p.token?.symbol}</span>
                            {p.token && <ChainTag chain={p.token.chain_id} />}
                          </div>
                          <p className="text-[11px] text-faint">Compra {formatDateTime(p.entry_at)}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="num px-3 py-2.5 text-right">{formatUsd(toNum(p.invested_usd))}</td>
                    <td className="num px-3 py-2.5 text-right">{formatPrice(toNum(p.entry_price))}</td>
                    <td className="num px-3 py-2.5 text-right">
                      {closed ? (
                        <span>{formatPrice(toNum(p.exit_price))} <Badge className="ml-1">venta</Badge></span>
                      ) : (
                        <span title={p.token?.data_updated_at ? `Actualizado ${timeAgo(p.token.data_updated_at)}` : undefined}>
                          {formatPrice(toNum(p.token?.price_usd))}
                        </span>
                      )}
                    </td>
                    <td className="num px-3 py-2.5 text-right">{formatUsd(value)}</td>
                    <td className={`num px-3 py-2.5 text-right ${(pnl ?? 0) >= 0 ? "text-up" : "text-down"}`}>
                      {pnl == null ? "—" : `${pnl >= 0 ? "+" : ""}${formatUsd(pnl)}`}
                    </td>
                    <td className="px-3 py-2.5 text-right"><Delta value={pnlPct} /></td>
                    <td className="num px-3 py-2.5 text-right text-up">{prot ? `+${formatUsd(prot.maxProfitUsd)}` : "—"}</td>
                    <td className="px-3 py-2.5 text-right"><Delta value={prot?.drawdownFromPeakPct} digits={1} /></td>
                    <td className="px-3 py-2.5 text-right">{closed ? <span className="text-faint">—</span> : <RiskBadge score={p.token?.risk_score} size="sm" />}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/portfolio/${p.id}`}><Button size="sm" variant="primary">Protección</Button></Link>
                        {closed ? (
                          <Button size="sm" variant="ghost" onClick={() => reopen(p)}>Reabrir</Button>
                        ) : (
                          <Button size="sm" onClick={() => setClosing(p)}>Registrar venta</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => remove(p)}>Eliminar</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal open={creating} onClose={() => setCreating(false)} title="Registrar posición">
        <div className="space-y-4">
          {!wl?.tokens.length ? (
            <InfoNote>Primero agrega el token a tu lista desde el <Link href="/dashboard" className="text-text underline">dashboard</Link>.</InfoNote>
          ) : (
            <Field label="Token">
              <Select value={tokenId} onChange={(e) => setTokenId(e.target.value)}>
                <option value="">Selecciona un token…</option>
                {wl.tokens.map((t) => (
                  <option key={t.id} value={t.id}>{t.symbol} · {formatPrice(toNum(t.price_usd))}</option>
                ))}
              </Select>
            </Field>
          )}
          {selectedToken && (
            <NewPositionForm
              key={selectedToken.id}
              tokenId={selectedToken.id}
              currentPrice={toNum(selectedToken.price_usd)}
              currentMarketCap={toNum(selectedToken.market_cap)}
              onSaved={() => {
                setCreating(false);
                setTokenId("");
                mutate();
              }}
            />
          )}
        </div>
      </Modal>
      <Modal open={!!closing} onClose={() => setClosing(null)} title="Registrar venta">
        {closing && (
          <ClosePositionForm
            position={closing}
            currentPrice={toNum(closing.token?.price_usd)}
            onSaved={() => {
              setClosing(null);
              mutate();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return (
    <div className="bg-panel px-4 py-3">
      <p className="text-[11px] text-faint">{label}</p>
      <p className={`num mt-1 text-lg ${tone == null ? "" : tone >= 0 ? "text-up" : "text-down"}`}>{value}</p>
    </div>
  );
}
