"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { ExternalLink, FlaskConical, Radio } from "lucide-react";
import { AlertExplanationCard } from "@/components/alert-explanation";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { RiskBadge, RiskFactors, RiskGauge, RISK_DISCLAIMER } from "@/components/risk";
import { DataAge, TokenAvatar } from "@/components/token-bits";
import { Delta, Panel, PanelHeader, Skeleton, cn } from "@/components/ui";
import { formatPrice, formatUsdCompact } from "@/lib/format";
import type { PublicSnapshot } from "@/lib/market/public";

const getJson = (u: string) => fetch(u).then((r) => r.json());

export default function DemoPage() {
  const { data } = useSWR<PublicSnapshot>("/api/demo", getJson, { refreshInterval: 30_000 });
  const [selected, setSelected] = useState(0);
  const t = data?.tokens[Math.min(selected, (data?.tokens.length ?? 1) - 1)];

  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-10">
        {data?.demo ? (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            <FlaskConical size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">DATOS DE DEMOSTRACIÓN</p>
              <p className="mt-0.5 text-warn/80">No hay conexión con la API de mercado en este momento. Los tokens y valores de esta página son ficticios y solo ilustran la interfaz.</p>
            </div>
          </div>
        ) : data ? (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-sm">
            <Radio size={18} className="mt-0.5 shrink-0 text-up" />
            <div className="text-muted">
              <p className="font-medium text-text">Datos reales de DexScreener</p>
              <p className="mt-0.5">
                Vista previa pública. Aquí la puntuación usa solo los datos actuales; con una cuenta, PeakAlert también registra el historial de
                cada token (máximos, rechazos, liquidez) y la puntuación es más completa.
              </p>
            </div>
            <DataAge at={data.fetchedAt} className="ml-auto shrink-0" />
          </div>
        ) : (
          <Skeleton className="mb-6 h-16 w-full" />
        )}

        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Peak Detection en vivo</h1>
            <p className="mt-1 text-sm text-muted">Riesgo de agotamiento del impulso (0–100) de memecoins populares de Solana.</p>
          </div>
          <Link href="/signup" className="rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:bg-white">Monitorear mis tokens gratis</Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <Panel className="overflow-hidden">
            <PanelHeader title="Tokens" sub="Selecciona uno para ver el detalle del análisis" />
            {!data ? (
              <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                      <th className="px-4 py-2.5 font-medium">Token</th>
                      <th className="px-3 py-2.5 text-right font-medium">Precio</th>
                      <th className="px-3 py-2.5 text-right font-medium">1h</th>
                      <th className="px-3 py-2.5 text-right font-medium">24h</th>
                      <th className="px-3 py-2.5 text-right font-medium">Market cap</th>
                      <th className="px-3 py-2.5 text-right font-medium">Liquidez</th>
                      <th className="px-3 py-2.5 text-right font-medium">Riesgo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tokens.map((x, i) => (
                      <tr key={x.address} onClick={() => setSelected(i)} className={cn("cursor-pointer border-b border-line last:border-0 hover:bg-panel-2/60", i === selected && "bg-panel-2/70")}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <TokenAvatar src={x.image_url} symbol={x.symbol} />
                            <div>
                              <p className="font-medium">{x.symbol}</p>
                              <p className="text-[11px] text-faint">{x.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="num px-3 py-2.5 text-right">{formatPrice(x.price_usd)}</td>
                        <td className="px-3 py-2.5 text-right"><Delta value={x.change_h1} /></td>
                        <td className="px-3 py-2.5 text-right"><Delta value={x.change_h24} /></td>
                        <td className="num px-3 py-2.5 text-right">{formatUsdCompact(x.market_cap)}</td>
                        <td className="num px-3 py-2.5 text-right text-muted">{formatUsdCompact(x.liquidity_usd)}</td>
                        <td className="px-3 py-2.5 text-right"><RiskBadge score={x.risk_score} coverage={x.risk_coverage} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data?.sol && (
              <p className="border-t border-line px-4 py-2.5 text-xs text-faint">
                SOL <span className="num text-text">{formatPrice(data.sol.price_usd)}</span> <Delta value={data.sol.change_h24} digits={1} className="text-xs" /> 24h
              </p>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title={t ? `${t.symbol} · Peak Detection` : "Peak Detection"}
              actions={t?.pair_url && <a href={t.pair_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">DexScreener <ExternalLink size={11} /></a>}
            />
            <div className="p-4">
              {t ? (
                <>
                  <RiskGauge score={t.risk_score} coverage={t.risk_coverage} />
                  <div className="mt-5">
                    {t.risk_factors.length ? <RiskFactors factors={t.risk_factors} /> : <p className="text-xs text-muted">Desglose no disponible en modo demostración.</p>}
                  </div>
                </>
              ) : (
                <Skeleton className="h-64" />
              )}
              <p className="mt-4 text-[11px] leading-relaxed text-faint">{RISK_DISCLAIMER}</p>
            </div>
          </Panel>
        </div>

        <div className="mt-12">
          <h2 className="text-lg font-semibold tracking-tight">Así se explica cada alerta</h2>
          <p className="mt-1 text-sm text-muted">
            Ejemplo ilustrativo (no corresponde a un token real): cada aviso dice qué pasa, por qué se generó, qué indicadores cambiaron, qué
            riesgo representa y qué vigilar.
          </p>
          <div className="mt-4 rounded-xl border border-line bg-panel p-4">
            <p className="mb-3 text-sm font-medium">EJEMPLO: Riesgo de agotamiento 78/100</p>
            <AlertExplanationCard
              e={{
                what: "Varios indicadores muestran señales típicas de agotamiento del impulso alcista.",
                why: "La puntuación de riesgo (78/100) superó tu umbral de 70.",
                indicators: [
                  { label: "Presión de venta", value: "1.9 ventas por compra · 82/100", tone: "down" },
                  { label: "Rechazos del máximo", value: "2 rechazos · 65/100", tone: "warn" },
                  { label: "Caída del volumen", value: "38% del promedio · 70/100", tone: "warn" },
                  { label: "Pérdida de momentum", value: "1h −6% · 6h +140%", tone: "down" },
                ],
                risk: "La puntuación resume señales observadas; no es la probabilidad de que el precio caiga. Es una señal basada en datos de mercado, no una predicción: el precio puede recuperarse.",
                watch: ["Qué factores siguen subiendo en el detalle del token.", "Si la puntuación baja de nuevo (el impulso se recupera).", "Tu nivel de trailing stop si tienes una posición."],
              }}
            />
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
