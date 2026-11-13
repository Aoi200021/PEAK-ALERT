"use client";

import Link from "next/link";
import useSWR from "swr";
import { ChartNoAxesColumn, Lock } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button, Delta, EmptyState, ErrorNote, InfoNote, Panel, PanelHeader, Skeleton } from "@/components/ui";
import { ALERT_META, type AlertType } from "@/lib/alerts/types";
import { fetcher } from "@/lib/client/api";
import { useI18n } from "@/lib/i18n/client";
import type { MeResponse } from "@/lib/client/types";

interface Bucket {
  samples: number;
  hitRate: number | null;
  avgChangePct: number | null;
}
interface Analytics {
  totalAlerts: number;
  overall: Record<string, Bucket>;
  byType: Record<string, Record<string, Bucket>>;
  avgMaxUpsideAfterPct: number | null;
}

const WINDOWS = ["1h", "24h", "7d"] as const;

export default function AnalyticsPage() {
  const { t: tr, p: pl } = useI18n();
  const { data: me } = useSWR<MeResponse>("/api/me", fetcher);
  const allowed = me?.plan.analytics;
  const { data, error } = useSWR<Analytics>(allowed ? "/api/analytics" : null, fetcher);

  return (
    <>
      <PageHeader
        title={tr("Analytics", "Analíticas")}
        sub={tr("Were your alerts useful? Based on Paper Exit: prices observed after each alert.", "¿Fueron útiles tus alertas? Basado en Paper Exit: precios observados después de cada alerta.")}
      />
      {me && !allowed ? (
        <Panel>
          <EmptyState icon={<Lock size={24} strokeWidth={1.5} />} title={tr("Advanced analytics available on Premium", "Analíticas avanzadas disponibles en Premium")}
            action={<Link href="/pricing"><Button variant="primary">{tr("See plans", "Ver planes")}</Button></Link>}
          >
            {tr("See, per alert type, what happened to the price 1h, 24h and 7 days after each alert.", "Mide, por tipo de alerta, qué pasó con el precio 1 h, 24 h y 7 días después de cada aviso.")}
          </EmptyState>
        </Panel>
      ) : error ? (
        <ErrorNote>{error.message}</ErrorNote>
      ) : !data ? (
        <Skeleton className="h-64 w-full" />
      ) : data.totalAlerts === 0 ? (
        <Panel>
          <EmptyState icon={<ChartNoAxesColumn size={26} strokeWidth={1.5} />} title={tr("Not enough data yet", "Aún no hay datos suficientes")}>
            {tr("Stats appear once your alerts fire and enough time passes to measure the outcome.", "Las estadísticas aparecen cuando tus alertas se disparan y pasa el tiempo suficiente para medir el resultado.")}
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
            <Tile label={tr("Alerts analyzed", "Alertas analizadas")} value={<span className="num">{data.totalAlerts}</span>} />
            {WINDOWS.map((w) => (
              <Tile
                key={w}
                label={tr(`Price lower after ${w}`, `Precio más bajo tras ${w}`)}
                value={
                  data.overall[w].samples ? (
                    <span className="num">{data.overall[w].hitRate!.toFixed(0)}% <span className="text-xs text-faint">{tr("of", "de")} {data.overall[w].samples}</span></span>
                  ) : (
                    <span className="text-faint">—</span>
                  )
                }
                sub={
                  data.overall[w].samples ? (
                    <>
                      {tr("Avg change", "Cambio medio")} <Delta value={data.overall[w].avgChangePct} digits={1} />
                    </>
                  ) : (
                    tr("no samples", "sin muestras")
                  )
                }
              />
            ))}
          </div>

          <Panel className="overflow-hidden">
            <PanelHeader
              title={tr("By alert type", "Por tipo de alerta")}
              sub={tr("% of alerts after which price was below the alert price, and average change.", "% de alertas tras las cuales el precio estaba por debajo del precio de la alerta, y variación media.")}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                    <th className="px-4 py-2.5 font-medium">{tr("Type", "Tipo")}</th>
                    {WINDOWS.map((w) => (
                      <th key={w} className="px-3 py-2.5 text-right font-medium">{w}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.byType).map(([type, b]) => (
                    <tr key={type} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">{ALERT_META[type as AlertType] ? pl(ALERT_META[type as AlertType].label) : type}</td>
                      {WINDOWS.map((w) => (
                        <td key={w} className="num px-3 py-2.5 text-right">
                          {b[w].samples ? (
                            <>
                              {b[w].hitRate!.toFixed(0)}% · <Delta value={b[w].avgChangePct} digits={1} />
                              <span className="ml-1 text-[11px] text-faint">n={b[w].samples}</span>
                            </>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {data.avgMaxUpsideAfterPct != null && (
            <InfoNote>
              {tr("Average max rise recorded after alerts:", "Subida máxima media registrada después de las alertas:")}{" "}
              <Delta value={data.avgMaxUpsideAfterPct} digits={1} />.{" "}
              {tr(
                "It shows how much upside would have been left on the table by selling at the alert (best case).",
                "Indica cuánto potencial se habría dejado sobre la mesa al vender en la alerta (en el mejor caso).",
              )}
            </InfoNote>
          )}
          <p className="text-[11px] text-faint">
            {tr(
              "Small samples aren't statistically significant. Past results don't guarantee future results.",
              "Muestras pequeñas no son estadísticamente significativas. Los resultados pasados no garantizan resultados futuros.",
            )}
          </p>
        </div>
      )}
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="bg-panel px-4 py-3">
      <p className="text-[11px] text-faint">{label}</p>
      <p className="mt-1 text-lg">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
