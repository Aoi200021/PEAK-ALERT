"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Copy, ExternalLink, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { AlertRuleForm, describeRule } from "@/components/alert-rule-form";
import { ClosePositionForm, NewPositionForm } from "@/components/position-forms";
import { PriceChart } from "@/components/price-chart";
import { ChainTag, DataAge, TokenAvatar } from "@/components/token-bits";
import { Badge, Button, Delta, EmptyState, ErrorNote, InfoNote, Modal, Panel, PanelHeader, Segmented, Skeleton } from "@/components/ui";
import { ALERT_META } from "@/lib/alerts/types";
import { api, ApiError, fetcher } from "@/lib/client/api";
import type { MeResponse, PositionDTO, RuleDTO, TokenDTO } from "@/lib/client/types";
import { formatDateTime, formatNumber, formatPrice, formatUsd, formatUsdCompact, shortAddress, timeAgo, toNum } from "@/lib/format";
import { positionPnl } from "@/lib/portfolio";

type Range = "1h" | "6h" | "24h" | "7d";

interface TokenResponse {
  token: TokenDTO;
  watched: boolean;
  history: { t: string; price: number }[];
  rules: RuleDTO[];
  positions: PositionDTO[];
  events: { id: string; title: string; created_at: string; price_usd: number; type: string }[];
  serverTime: string;
}

export default function TokenPage() {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<Range>("24h");
  const { data, error, mutate } = useSWR<TokenResponse>(`/api/tokens/${id}?range=${range}`, fetcher, {
    refreshInterval: 30_000,
    keepPreviousData: true,
  });
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);
  const [ruleModal, setRuleModal] = useState<{ open: boolean; rule?: RuleDTO }>({ open: false });
  const [posModal, setPosModal] = useState(false);
  const [closing, setClosing] = useState<PositionDTO | null>(null);

  const t = data?.token;
  const price = toNum(t?.price_usd);
  const openPosition = data?.positions.find((p) => p.exit_price == null);
  const markers = useMemo(
    () => (data?.events ?? []).map((e) => ({ t: e.created_at, label: ALERT_META[e.type as keyof typeof ALERT_META]?.short ?? "Alerta" })),
    [data?.events],
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
    if (!confirm("¿Eliminar esta alerta?")) return;
    await api(`/api/alerts/rules/${r.id}`, { method: "DELETE" }).catch(() => null);
    mutate();
  }
  async function deletePosition(p: PositionDTO) {
    if (!confirm("¿Eliminar este registro de posición?")) return;
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
              {!data.watched && <Badge>No lo sigues</Badge>}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <span>{t.name}</span>
              <button
                className="num inline-flex items-center gap-1 text-faint hover:text-text"
                onClick={() => navigator.clipboard.writeText(t.address)}
                title="Copiar dirección"
              >
                {shortAddress(t.address)} <Copy size={11} />
              </button>
              {t.pair_url && (
                <a href={t.pair_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-faint hover:text-text">
                  DexScreener <ExternalLink size={11} />
                </a>
              )}
            </div>
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
          Última actualización fallida ({timeAgo(t.last_error_at)}): {t.last_error}. Se muestran los últimos datos válidos.
        </InfoNote>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4 lg:grid-cols-8">
        <Kv k="Market cap" v={formatUsdCompact(toNum(t.market_cap))} />
        <Kv k="FDV" v={formatUsdCompact(toNum(t.fdv))} />
        <Kv k="Liquidez" v={formatUsdCompact(toNum(t.liquidity_usd))} />
        <Kv k="Vol. 1h" v={formatUsdCompact(toNum(t.volume_h1))} />
        <Kv k="Vol. 24h" v={formatUsdCompact(toNum(t.volume_h24))} />
        <Kv k="5m / 1h / 6h" v={<span className="flex gap-1.5"><Delta value={toNum(t.change_m5)} digits={1} /><Delta value={toNum(t.change_h1)} digits={1} /><Delta value={toNum(t.change_h6)} digits={1} /></span>} />
        <Kv k="Tx 1h (compras/ventas)" v={txH1 ? <span><span className="text-up">{txH1.buys}</span> / <span className="text-down">{txH1.sells}</span></span> : "—"} />
        <Kv k="Máx. registrado" v={<span>{formatPrice(toNum(t.peak_price))} <Delta value={peakDist} digits={1} className="text-[11px]" /></span>} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Chart */}
        <Panel>
          <PanelHeader
            title="Precio"
            sub="Historial registrado por PeakAlert (snapshots cada ~1 min mientras el token está siendo monitoreado)"
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
            {data.history.length < 2 ? (
              <EmptyState title="Recopilando datos">
                PeakAlert empezó a registrar este token hace poco. La gráfica se irá llenando con cada actualización.
              </EmptyState>
            ) : (
              <PriceChart points={data.history} markers={markers} entryPrice={toNum(openPosition?.entry_price)} />
            )}
          </div>
          {txH24 && (
            <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
              24h: {formatNumber(txH24.buys)} compras · {formatNumber(txH24.sells)} ventas · Par {t.dex_id} · creado {t.pair_created_at ? formatDateTime(t.pair_created_at) : "—"}
            </p>
          )}
        </Panel>

        <div className="space-y-5">
          {/* Alerts */}
          <Panel>
            <PanelHeader
              title="Alertas"
              actions={
                data.watched && (
                  <Button size="sm" onClick={() => setRuleModal({ open: true })}>
                    <Plus size={13} /> Nueva
                  </Button>
                )
              }
            />
            {data.rules.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">
                {data.watched ? "Sin alertas para este token." : "Agrega el token a tu lista para crear alertas."}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {data.rules.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px]">{ALERT_META[r.type].label}</span>
                        {!r.enabled ? <Badge>pausada</Badge> : r.armed ? <Badge tone="up">vigilando</Badge> : <Badge tone="warn">disparada</Badge>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-faint">{describeRule(r)}</p>
                      {r.last_triggered_at && <p className="text-[11px] text-faint">Último aviso {timeAgo(r.last_triggered_at)}</p>}
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <IconBtn label={r.enabled ? "Pausar" : "Activar"} onClick={() => toggleRule(r)}>{r.enabled ? <Pause size={13} /> : <Play size={13} />}</IconBtn>
                      <IconBtn label="Editar" onClick={() => setRuleModal({ open: true, rule: r })}><Pencil size={13} /></IconBtn>
                      <IconBtn label="Eliminar" onClick={() => deleteRule(r)} danger><Trash2 size={13} /></IconBtn>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Positions */}
          <Panel>
            <PanelHeader
              title="Mi posición"
              actions={
                me?.plan.portfolio && (
                  <Button size="sm" onClick={() => setPosModal(true)}>
                    <Plus size={13} /> Registrar
                  </Button>
                )
              }
            />
            {!me?.plan.portfolio ? (
              <p className="px-4 py-6 text-center text-xs text-muted">
                El portfolio tracker está disponible en Pro y Premium. <Link href="/settings" className="text-text underline underline-offset-2">Ver planes</Link>
              </p>
            ) : data.positions.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">Registra tu precio de entrada para ver tu P&amp;L estimado.</p>
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
                        {pnl.closed ? <Badge>vendida</Badge> : <Badge tone="up">abierta</Badge>}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="num text-sm">{formatUsd(pnl.value)}</span>
                        <span className="num">
                          <span className={(pnl.pnl ?? 0) >= 0 ? "text-up" : "text-down"}>{pnl.pnl != null ? `${pnl.pnl >= 0 ? "+" : ""}${formatUsd(pnl.pnl)}` : "—"}</span>{" "}
                          <Delta value={pnl.pnlPct} />
                        </span>
                      </div>
                      {pnl.closed && <p className="mt-1 text-faint">Vendida a {formatPrice(toNum(p.exit_price))} · {formatDateTime(p.exit_at)}</p>}
                      <div className="mt-2 flex gap-1.5">
                        {!pnl.closed && <Button size="sm" onClick={() => setClosing(p)}>Registrar venta</Button>}
                        <Button size="sm" variant="ghost" onClick={() => deletePosition(p)}>Eliminar</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Modal open={ruleModal.open} onClose={() => setRuleModal({ open: false })} title={ruleModal.rule ? "Editar alerta" : `Nueva alerta · ${t.symbol}`}>
        <AlertRuleForm
          key={ruleModal.rule?.id ?? "new"}
          tokenId={t.id}
          me={me}
          existing={ruleModal.rule}
          onSaved={() => {
            setRuleModal({ open: false });
            mutate();
          }}
        />
      </Modal>
      <Modal open={posModal} onClose={() => setPosModal(false)} title={`Registrar posición · ${t.symbol}`}>
        <NewPositionForm
          tokenId={t.id}
          currentPrice={price}
          onSaved={() => {
            setPosModal(false);
            mutate();
          }}
        />
      </Modal>
      <Modal open={!!closing} onClose={() => setClosing(null)} title="Registrar venta">
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
