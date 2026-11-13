"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Copy, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { AlertRuleForm, describeRule } from "@/components/alert-rule-form";
import { ClosePositionForm, NewPositionForm } from "@/components/position-forms";
import { PriceChart } from "@/components/price-chart";
import { OpenIn } from "@/components/open-in";
import { RiskFactors, RiskGauge, RISK_DISCLAIMER } from "@/components/risk";
import type { AlertType } from "@/lib/alerts/types";
import { ChainTag, DataAge, TokenAvatar } from "@/components/token-bits";
import { Badge, Button, Delta, EmptyState, ErrorNote, InfoNote, Modal, Panel, PanelHeader, Segmented, Skeleton } from "@/components/ui";
import { ALERT_META } from "@/lib/alerts/types";
import { api, ApiError, fetcher } from "@/lib/client/api";
import type { MeResponse, PositionDTO, RuleDTO, TokenDTO } from "@/lib/client/types";
import { formatDateTime, formatNumber, formatPrice, formatUsd, formatUsdCompact, shortAddress, timeAgo, toNum } from "@/lib/format";
import { positionPnl } from "@/lib/portfolio";
import { useI18n } from "@/lib/i18n/client";
import { pickMsg } from "@/lib/i18n";

type Range = "1h" | "6h" | "24h" | "7d";
type Mode = "price" | "mcap" | "risk";

interface TokenResponse {
  token: TokenDTO;
  watched: boolean;
  riskBreakdown: boolean;
  signalHistory: boolean;
  history: { t: string; price: number; market_cap: number | null; risk_score: number | null }[];
  rules: RuleDTO[];
  positions: PositionDTO[];
  events: { id: string; title: string; created_at: string; price_usd: number; type: string }[];
  serverTime: string;
}

export default function TokenPage() {
  const { id } = useParams<{ id: string }>();
  const { t: tr, p: pl, locale } = useI18n();
  const [range, setRange] = useState<Range>("24h");
  const [mode, setMode] = useState<Mode>("price");
  const { data, error, mutate } = useSWR<TokenResponse>(`/api/tokens/${id}?range=${range}`, fetcher, {
    refreshInterval: 30_000,
    keepPreviousData: true,
  });
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);
  const [ruleModal, setRuleModal] = useState<{ open: boolean; rule?: RuleDTO; type?: AlertType }>({ open: false });
  const [posModal, setPosModal] = useState(false);
  const [closing, setClosing] = useState<PositionDTO | null>(null);

  const t = data?.token;
  const price = toNum(t?.price_usd);
  const openPosition = data?.positions.find((p) => p.exit_price == null);
  const chartPoints = useMemo(
    () =>
      (data?.history ?? [])
        .map((h) => ({ t: h.t, price: Number(mode === "price" ? h.price : mode === "mcap" ? h.market_cap : h.risk_score) }))
        .filter((p) => Number.isFinite(p.price) && (mode === "risk" ? p.price >= 0 : p.price > 0)),
    [data?.history, mode],
  );
  const markers = useMemo(
    () => (data?.events ?? []).map((e) => ({ t: e.created_at, label: pl(ALERT_META[e.type as keyof typeof ALERT_META]?.short) || tr("Alert", "Alerta") })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pl/tr change with locale
    [data?.events, locale],
  );

  if (error && !data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorNote>{error.message}</ErrorNote>
      </div>
    );
  }
  if (!t) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  async function toggleRule(r: RuleDTO) {
    try {
      await api(`/api/alerts/rules/${r.id}`, { method: "PATCH", json: { enabled: !r.enabled } });
      mutate();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Error");
    }
  }
  async function deleteRule(r: RuleDTO) {
    if (!confirm(tr("Delete this alert?", "¿Eliminar esta alerta?"))) return;
    await api(`/api/alerts/rules/${r.id}`, { method: "DELETE" }).catch(() => null);
    mutate();
  }
  async function deletePosition(p: PositionDTO) {
    if (!confirm(tr("Delete this position record?", "¿Eliminar este registro de posición?"))) return;
    await api(`/api/positions/${p.id}`, { method: "DELETE" }).catch(() => null);
    mutate();
  }

  const peakDist = price != null && toNum(t.peak_price) ? (price / toNum(t.peak_price)! - 1) * 100 : null;
  const txH1 = t.txns?.h1;
  const txH24 = t.txns?.h24;

  return (
    <div className="space-y-5">
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <TokenAvatar src={t.image_url} symbol={t.symbol} size={44} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{t.symbol}</h1>
              <ChainTag chain={t.chain_id} />
              {!data.watched && <Badge>{tr("Not following", "No lo sigues")}</Badge>}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span>{t.name}</span>
              <button
                className="num inline-flex items-center gap-1 text-faint hover:text-text"
                onClick={() => navigator.clipboard.writeText(t.address)}
                title={tr("Copy address", "Copiar dirección")}
              >
                {shortAddress(t.address)} <Copy size={11} />
              </button>
            </div>
            <OpenIn chainId={t.chain_id} address={t.address} pairUrl={t.pair_url} className="mt-2" />
          </div>
        </div>
        <div className="text-right">
          <p className="num text-2xl tracking-tight">{formatPrice(price)}</p>
          <div className="mt-0.5 flex items-center justify-end gap-3 text-xs">
            <Delta value={toNum(t.change_h24)} /> <span className="text-faint">24h</span>
            <DataAge at={t.data_updated_at} />
          </div>
        </div>
      </div>

      {t.last_error && (
        <InfoNote tone="warn">
          {tr("Last update failed", "Última actualización fallida")} ({timeAgo(t.last_error_at, undefined, locale)}): {pickMsg(t.last_error ?? "", locale)}.{" "}
          {tr("Showing the latest valid data.", "Se muestran los últimos datos válidos.")}
        </InfoNote>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4 lg:grid-cols-8">
        <Kv k="Market cap" v={formatUsdCompact(toNum(t.market_cap))} />
        <Kv k="FDV" v={formatUsdCompact(toNum(t.fdv))} />
        <Kv k={tr("Liquidity", "Liquidez")} v={formatUsdCompact(toNum(t.liquidity_usd))} />
        <Kv k="Vol. 1h" v={formatUsdCompact(toNum(t.volume_h1))} />
        <Kv k="Vol. 24h" v={formatUsdCompact(toNum(t.volume_h24))} />
        <Kv k="5m / 1h / 6h" v={<span className="flex gap-1.5"><Delta value={toNum(t.change_m5)} digits={1} /><Delta value={toNum(t.change_h1)} digits={1} /><Delta value={toNum(t.change_h6)} digits={1} /></span>} />
        <Kv k={tr("Tx 1h (buys/sells)", "Tx 1h (compras/ventas)")} v={txH1 ? <span><span className="text-up">{txH1.buys}</span> / <span className="text-down">{txH1.sells}</span></span> : "—"} />
        <Kv k={tr("Recorded high", "Máx. registrado")} v={<span>{formatPrice(toNum(t.peak_price))} <Delta value={peakDist} digits={1} className="text-[11px]" /></span>} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Chart */}
        <Panel>
          <PanelHeader
            title={
              <Segmented<Mode>
                value={mode}
                onChange={setMode}
                options={[
                  { value: "price", label: tr("Price", "Precio") },
                  { value: "mcap", label: "Market cap" },
                  ...(data.signalHistory ? [{ value: "risk" as const, label: tr("Risk", "Riesgo") }] : []),
                ]}
              />
            }
            sub={tr("History recorded by PeakAlert (≈ 1 point per minute while tracked)", "Historial registrado por PeakAlert (≈ 1 punto por minuto mientras se monitorea)")}
            actions={
              <Segmented<Range>
                value={range}
                onChange={setRange}
                options={[
                  { value: "1h", label: "1H" },
                  { value: "6h", label: "6H" },
                  { value: "24h", label: "24H" },
                  { value: "7d", label: "7D" },
                ]}
              />
            }
          />
          <div className="p-2">
            {chartPoints.length < 2 ? (
              <EmptyState title={tr("Collecting data", "Recopilando datos")}>
                {tr(
                  "PeakAlert started recording this token recently. The chart will fill in with every update.",
                  "PeakAlert empezó a registrar este token hace poco. La gráfica se irá llenando con cada actualización.",
                )}
              </EmptyState>
            ) : mode === "risk" ? (
              <PriceChart
                entryLabel={tr("entry", "entrada")}
                key="risk"
                points={chartPoints}
                color="#f0883e"
                format={(v) => v.toFixed(0)}
                lines={[{ value: 30, label: "30" }, { value: 60, label: "60" }, { value: 80, label: "80" }]}
              />
            ) : (
              <PriceChart
                key={mode}
                entryLabel={tr("entry", "entrada")}
                points={chartPoints}
                markers={markers}
                entryPrice={mode === "price" ? toNum(openPosition?.entry_price) : null}
                format={mode === "price" ? formatPrice : formatUsdCompact}
              />
            )}
          </div>
          {txH24 && (
            <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
              24h: {formatNumber(txH24.buys)} {tr("buys", "compras")} · {formatNumber(txH24.sells)} {tr("sells", "ventas")} · {tr("Pair", "Par")} {t.dex_id} ·{" "}
              {tr("created", "creado")} {t.pair_created_at ? formatDateTime(t.pair_created_at, locale) : "—"}
            </p>
          )}
        </Panel>

        <div className="space-y-5">
          {/* Peak Detection */}
          <Panel>
            <PanelHeader
              title="Peak Detection"
              sub={tr("Momentum exhaustion risk", "Riesgo de agotamiento del impulso")}
              actions={
                data.watched &&
                me?.plan.alertTypes.includes("exhaustion_risk") && (
                  <Button size="sm" onClick={() => setRuleModal({ open: true, type: "exhaustion_risk" })}>
                    {tr("Alert me", "Alertarme")}
                  </Button>
                )
              }
            />
            <div className="p-4">
              <RiskGauge score={t.risk_score ?? null} coverage={toNum(t.risk_coverage)} />
              {t.risk_updated_at && <p className="mt-2 text-center text-[11px] text-faint">{tr("Calculated", "Calculado")} {timeAgo(t.risk_updated_at, undefined, locale)}</p>}
              <div className="mt-5">
                <RiskFactors factors={t.risk_factors} locked={!data.riskBreakdown} />
              </div>
              <p className="mt-4 text-[11px] leading-relaxed text-faint">{pl(RISK_DISCLAIMER)}</p>
            </div>
          </Panel>

          {/* Alerts */}
          <Panel>
            <PanelHeader
              title={tr("Alerts", "Alertas")}
              actions={
                data.watched && (
                  <Button size="sm" onClick={() => setRuleModal({ open: true })}>
                    <Plus size={13} /> {tr("New", "Nueva")}
                  </Button>
                )
              }
            />
            {data.rules.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">
                {data.watched
                  ? tr("No alerts for this token.", "Sin alertas para este token.")
                  : tr("Add the token to your watchlist to create alerts.", "Agrega el token a tu lista para crear alertas.")}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.rules.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px]">{pl(ALERT_META[r.type].label)}</span>
                        {!r.enabled ? (
                          <Badge>{tr("paused", "pausada")}</Badge>
                        ) : r.armed ? (
                          <Badge tone="up">{tr("watching", "vigilando")}</Badge>
                        ) : (
                          <Badge tone="warn">{tr("triggered", "disparada")}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-faint">{describeRule(r, locale)}</p>
                      {r.last_triggered_at && (
                        <p className="text-[11px] text-faint">
                          {tr("Last alert", "Último aviso")} {timeAgo(r.last_triggered_at, undefined, locale)}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <IconBtn label={r.enabled ? tr("Pause", "Pausar") : tr("Enable", "Activar")} onClick={() => toggleRule(r)}>{r.enabled ? <Pause size={13} /> : <Play size={13} />}</IconBtn>
                      <IconBtn label={tr("Edit", "Editar")} onClick={() => setRuleModal({ open: true, rule: r })}><Pencil size={13} /></IconBtn>
                      <IconBtn label={tr("Delete", "Eliminar")} onClick={() => deleteRule(r)} danger><Trash2 size={13} /></IconBtn>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Positions */}
          <Panel>
            <PanelHeader
              title="Profit Protection"
              actions={
                me?.plan.portfolio && (
                  <Button size="sm" onClick={() => setPosModal(true)}>
                    <Plus size={13} /> {tr("Add", "Registrar")}
                  </Button>
                )
              }
            />
            {!me?.plan.portfolio ? (
              <p className="px-4 py-6 text-center text-xs text-muted">
                {tr("Profit Protection is available on Pro and Premium.", "Profit Protection está disponible en Pro y Premium.")}{" "}
                <Link href="/pricing" className="text-text underline underline-offset-2">{tr("See plans", "Ver planes")}</Link>
              </p>
            ) : data.positions.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">
                {tr("Add your entry price to see your estimated P&L.", "Registra tu precio de entrada para ver tu P&L estimado.")}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.positions.map((p) => {
                  const pnl = positionPnl(p, price);
                  return (
                    <li key={p.id} className="px-4 py-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted">
                          {formatUsd(toNum(p.invested_usd))} @ <span className="num text-text">{formatPrice(toNum(p.entry_price))}</span>
                        </span>
                        {pnl.closed ? <Badge>{tr("sold", "vendida")}</Badge> : <Badge tone="up">{tr("open", "abierta")}</Badge>}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="num text-sm">{formatUsd(pnl.value)}</span>
                        <span className="num">
                          <span className={(pnl.pnl ?? 0) >= 0 ? "text-up" : "text-down"}>{pnl.pnl != null ? `${pnl.pnl >= 0 ? "+" : ""}${formatUsd(pnl.pnl)}` : "—"}</span>{" "}
                          <Delta value={pnl.pnlPct} />
                        </span>
                      </div>
                      {pnl.closed && (
                        <p className="mt-1 text-faint">
                          {tr("Sold at", "Vendida a")} {formatPrice(toNum(p.exit_price))} · {formatDateTime(p.exit_at, locale)}
                        </p>
                      )}
                      <div className="mt-2 flex gap-1.5">
                        <Link href={`/portfolio/${p.id}`}><Button size="sm">{tr("Protection", "Protección")}</Button></Link>
                        {!pnl.closed && <Button size="sm" onClick={() => setClosing(p)}>{tr("Record sale", "Registrar venta")}</Button>}
                        <Button size="sm" variant="ghost" onClick={() => deletePosition(p)}>{tr("Delete", "Eliminar")}</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Modal open={ruleModal.open} onClose={() => setRuleModal({ open: false })} title={ruleModal.rule ? tr("Edit alert", "Editar alerta") : `${tr("New alert", "Nueva alerta")} · ${t.symbol}`}>
        <AlertRuleForm
          key={ruleModal.rule?.id ?? `new-${ruleModal.type ?? ""}`}
          tokenId={t.id}
          me={me}
          existing={ruleModal.rule}
          initialType={ruleModal.type}
          positions={data.positions
            .filter((p) => p.exit_price == null)
            .map((p) => ({ id: p.id, label: `${formatUsd(toNum(p.invested_usd))} @ ${formatPrice(toNum(p.entry_price))}` }))}
          onSaved={() => {
            setRuleModal({ open: false });
            mutate();
          }}
        />
      </Modal>
      <Modal open={posModal} onClose={() => setPosModal(false)} title={`${tr("Add position", "Registrar posición")} · ${t.symbol}`}>
        <NewPositionForm
          tokenId={t.id}
          currentPrice={price}
          currentMarketCap={toNum(t.market_cap)}
          onSaved={() => {
            setPosModal(false);
            mutate();
          }}
        />
      </Modal>
      <Modal open={!!closing} onClose={() => setClosing(null)} title={tr("Record sale", "Registrar venta")}>
        {closing && (
          <ClosePositionForm
            position={closing}
            currentPrice={price}
            onSaved={() => {
              setClosing(null);
              mutate();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
      <ArrowLeft size={13} /> Dashboard
    </Link>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="bg-panel px-3 py-2.5">
      <p className="truncate text-[11px] text-faint">{k}</p>
      <div className="num mt-0.5 text-[13px]">{v}</div>
    </div>
  );
}

function IconBtn({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`rounded p-1.5 text-faint hover:bg-panel-2 ${danger ? "hover:text-down" : "hover:text-text"}`}
    >
      {children}
    </button>
  );
}
