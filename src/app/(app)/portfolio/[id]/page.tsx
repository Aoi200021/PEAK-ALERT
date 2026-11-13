"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ArrowLeft, ShieldCheck, Trash2 } from "lucide-react";
import { AlertRuleForm, describeRule } from "@/components/alert-rule-form";
import { ClosePositionForm } from "@/components/position-forms";
import { PriceChart } from "@/components/price-chart";
import { RiskBadge } from "@/components/risk";
import { ChainTag, DataAge, TokenAvatar } from "@/components/token-bits";
import { Badge, Button, Delta, EmptyState, ErrorNote, InfoNote, Modal, Panel, PanelHeader, Skeleton, cn } from "@/components/ui";
import { ALERT_META, type AlertType } from "@/lib/alerts/types";
import { api, fetcher } from "@/lib/client/api";
import type { MeResponse, PositionDTO, RuleDTO } from "@/lib/client/types";
import { formatDateTime, formatPrice, formatUsd, formatUsdCompact, timeAgo, toNum } from "@/lib/format";
import type { ProtectionSummary, StopSimulation } from "@/lib/protection";

interface ProtectionResponse {
  position: PositionDTO;
  token: { id: string; symbol: string; name: string; chain_id: string; image_url: string | null; price_usd: number | null; market_cap: number | null; data_updated_at: string | null; risk_score: number | null; risk_level: string | null };
  closed: boolean;
  summary: ProtectionSummary;
  simulations: StopSimulation[];
  path: { t: string; price: number; market_cap: number | null }[];
  coverageStart: string | null;
  bucketSeconds: number;
  rules: RuleDTO[];
}

const money = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${formatUsd(Math.abs(v))}`);

export default function ProtectionPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, mutate } = useSWR<ProtectionResponse>(`/api/positions/${id}/protection`, fetcher, { refreshInterval: 30_000 });
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);
  const [ruleType, setRuleType] = useState<AlertType | null>(null);
  const [closing, setClosing] = useState(false);

  const points = useMemo(() => (data?.path ?? []).map((p) => ({ t: p.t, price: p.price })), [data?.path]);

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Back />
        <ErrorNote>{error.message}</ErrorNote>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <Back />
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const { position: p, token: t, summary: s } = data;
  const entry = toNum(p.entry_price)!;
  const invested = toNum(p.invested_usd)!;
  const price = data.closed ? toNum(p.exit_price) : toNum(t.price_usd);
  const startedLate = data.coverageStart && Date.parse(data.coverageStart) - Date.parse(p.entry_at) > 30 * 60_000;

  async function removeRule(r: RuleDTO) {
    if (!confirm("¿Eliminar esta alerta?")) return;
    await api(`/api/alerts/rules/${r.id}`, { method: "DELETE" }).catch(() => null);
    mutate();
  }

  return (
    <div className="space-y-5">
      <Back />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <TokenAvatar src={t.image_url} symbol={t.symbol} size={44} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">Profit Protection · {t.symbol}</h1>
              <ChainTag chain={t.chain_id} />
              {data.closed ? <Badge>vendida</Badge> : <Badge tone="up">abierta</Badge>}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {formatUsd(invested)} invertidos a {formatPrice(entry)}
              {toNum(p.entry_market_cap) ? ` (MC ${formatUsdCompact(toNum(p.entry_market_cap))})` : ""} · {formatDateTime(p.entry_at)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-faint">Riesgo <RiskBadge score={t.risk_score} /></span>
          {!data.closed && <DataAge at={t.data_updated_at} />}
          {!data.closed && <Button size="sm" onClick={() => setClosing(true)}>Registrar venta</Button>}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3 xl:grid-cols-6">
        <Kv k={data.closed ? "Valor al vender" : "Valor actual"} v={formatUsd(s.currentValue)} />
        <Kv k="Ganancia / pérdida" v={<span className={(s.pnlUsd ?? 0) >= 0 ? "text-up" : "text-down"}>{money(s.pnlUsd)}</span>} />
        <Kv k="ROI" v={<Delta value={s.roiPct} digits={1} />} />
        <Kv k="Máx. beneficio no realizado" v={<span className="text-up">{money(s.maxProfitUsd)}</span>} sub={<Delta value={s.maxRoiPct} digits={0} />} />
        <Kv k="Caída desde el máximo" v={<Delta value={s.drawdownFromPeakPct} digits={1} />} sub={`máx. ${formatPrice(s.peakPrice)}`} />
        <Kv
          k="Beneficio devuelto"
          v={s.givebackPct == null ? "—" : <span className={s.givebackPct >= 50 ? "text-down" : s.givebackPct >= 25 ? "text-warn" : "text-text"}>{s.givebackPct.toFixed(0)}%</span>}
          sub="del beneficio máximo"
        />
      </div>

      {s.givebackPct != null && s.givebackPct > 0 && (
        <div className="rounded-lg border border-line bg-panel p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted">Beneficio conservado vs. devuelto</span>
            <span className="num text-faint">
              {money(s.pnlUsd)} de {money(s.maxProfitUsd)}
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-down/30">
            <div className="h-full bg-up transition-[width] duration-700" style={{ width: `${100 - s.givebackPct}%` }} />
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Panel>
            <PanelHeader title="Precio desde tu entrada" sub="Línea punteada = tu precio de entrada" />
            <div className="p-2">
              {points.length < 2 ? (
                <EmptyState title="Sin historial suficiente">PeakAlert necesita registrar precios desde tu entrada para dibujar la gráfica.</EmptyState>
              ) : (
                <PriceChart points={points} entryPrice={entry} height={260} lines={[{ value: s.peakPrice, label: "máx.", color: "#2ebd85" }]} />
              )}
            </div>
          </Panel>

          {/* Trailing stop simulation */}
          <Panel className="overflow-hidden">
            <PanelHeader title="¿Cuánto habrías conservado?" sub="Simulación de trailing stops sobre los precios observados desde tu entrada" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                    <th className="px-4 py-2.5 font-medium">Vender si cae desde el máx.</th>
                    <th className="px-3 py-2.5 text-right font-medium">Precio de salida</th>
                    <th className="px-3 py-2.5 text-right font-medium">Ganancia conservada</th>
                    <th className="px-3 py-2.5 text-right font-medium">ROI</th>
                    <th className="px-3 py-2.5 text-right font-medium">vs. ahora</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line bg-up/[0.03]">
                    <td className="px-4 py-2.5 text-muted">En el máximo (mejor caso teórico)</td>
                    <td className="num px-3 py-2.5 text-right">{formatPrice(s.peakPrice)}</td>
                    <td className="num px-3 py-2.5 text-right text-up">{money(s.maxProfitUsd)}</td>
                    <td className="px-3 py-2.5 text-right"><Delta value={s.maxRoiPct} digits={1} /></td>
                    <td className="num px-3 py-2.5 text-right text-faint">{s.pnlUsd != null ? money(s.maxProfitUsd - s.pnlUsd) : "—"}</td>
                  </tr>
                  {data.simulations.map((sim) => (
                    <tr key={sim.trailPct} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">
                        Trailing {sim.trailPct}%
                        {sim.triggered && sim.exitAt && <span className="ml-2 text-[11px] text-faint">{formatDateTime(new Date(sim.exitAt))}</span>}
                      </td>
                      {sim.triggered ? (
                        <>
                          <td className="num px-3 py-2.5 text-right">{formatPrice(sim.exitPrice)}</td>
                          <td className={cn("num px-3 py-2.5 text-right", (sim.pnlUsd ?? 0) >= 0 ? "text-up" : "text-down")}>{money(sim.pnlUsd)}</td>
                          <td className="px-3 py-2.5 text-right"><Delta value={sim.roiPct} digits={1} /></td>
                          <td className={cn("num px-3 py-2.5 text-right", sim.pnlUsd != null && s.pnlUsd != null && sim.pnlUsd - s.pnlUsd >= 0 ? "text-up" : "text-down")}>
                            {sim.pnlUsd != null && s.pnlUsd != null ? money(sim.pnlUsd - s.pnlUsd) : "—"}
                          </td>
                        </>
                      ) : (
                        <td colSpan={4} className="px-3 py-2.5 text-right text-xs text-faint">No se habría activado (el precio no cayó {sim.trailPct}% desde un máximo)</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-faint">
              Usa el primer precio observado por debajo de cada nivel (granularidad ≈ {Math.round(data.bucketSeconds / 60)} min). En la práctica la
              ejecución depende de la liquidez y el slippage. No incluye comisiones.
              {startedLate && ` PeakAlert empezó a registrar este token el ${formatDateTime(data.coverageStart)}: antes no hay datos.`}
            </p>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <PanelHeader title={<span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-up" /> Alertas de protección</span>} />
            <div className="space-y-3 p-4">
              {data.closed ? (
                <p className="text-xs text-muted">La posición está cerrada; las alertas de protección ya no se evalúan.</p>
              ) : !me?.plan.alertTypes.includes("trailing_stop") ? (
                <InfoNote>Las alertas de trailing stop y retroceso están en Pro y Premium. <Link href="/pricing" className="text-text underline">Ver planes</Link></InfoNote>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => setRuleType("trailing_stop")}>+ Trailing stop</Button>
                  <Button onClick={() => setRuleType("profit_giveback")}>+ Retroceso</Button>
                </div>
              )}
              {data.rules.length === 0 ? (
                <p className="text-xs text-faint">Sin alertas de protección para esta posición.</p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {data.rules.map((r) => (
                    <li key={r.id} className="flex items-start gap-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px]">{ALERT_META[r.type].label}</p>
                        <p className="text-[11px] text-faint">{describeRule(r)}</p>
                        {r.last_triggered_at && <p className="text-[11px] text-faint">Último aviso {timeAgo(r.last_triggered_at)}</p>}
                      </div>
                      {r.armed ? <Badge tone="up">vigilando</Badge> : <Badge tone="warn">disparada</Badge>}
                      <button onClick={() => removeRule(r)} className="rounded p-1 text-faint hover:text-down" aria-label="Eliminar">
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] leading-relaxed text-faint">
                Recibes una notificación cuando se cumple la condición. PeakAlert nunca vende por ti.
              </p>
            </div>
          </Panel>
          <InfoNote>
            &ldquo;Máximo&rdquo; = el precio más alto que PeakAlert ha observado desde tu entrada. Si compraste antes de que PeakAlert siguiera el
            token, un máximo anterior no está incluido.
          </InfoNote>
        </div>
      </div>

      <Modal open={ruleType != null} onClose={() => setRuleType(null)} title="Nueva alerta de protección">
        {ruleType && (
          <AlertRuleForm
            key={ruleType}
            tokenId={t.id}
            me={me}
            initialType={ruleType}
            initialPositionId={p.id}
            positions={[{ id: p.id, label: `${formatUsd(invested)} @ ${formatPrice(entry)}` }]}
            onSaved={() => {
              setRuleType(null);
              mutate();
            }}
          />
        )}
      </Modal>
      <Modal open={closing} onClose={() => setClosing(false)} title="Registrar venta">
        <ClosePositionForm
          position={p}
          currentPrice={price}
          onSaved={() => {
            setClosing(false);
            mutate();
          }}
        />
      </Modal>
    </div>
  );
}

function Back() {
  return (
    <Link href="/portfolio" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
      <ArrowLeft size={13} /> Profit Protection
    </Link>
  );
}

function Kv({ k, v, sub }: { k: string; v: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-panel px-4 py-3">
      <p className="truncate text-[11px] text-faint">{k}</p>
      <div className="num mt-1 text-lg">{v}</div>
      {sub && <div className="num mt-0.5 text-[11px] text-faint">{sub}</div>}
    </div>
  );
}
