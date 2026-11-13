"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { FlaskConical, Radio, Search } from "lucide-react";
import { AlertExplanationCard } from "@/components/alert-explanation";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { RiskBadge, RiskFactors, RiskGauge, RISK_DISCLAIMER } from "@/components/risk";
import { ChainTag, DataAge, TokenAvatar } from "@/components/token-bits";
import { OpenIn } from "@/components/open-in";
import { Badge, Button, Delta, ErrorNote, Input, Panel, PanelHeader, Skeleton, cn } from "@/components/ui";
import { formatPrice, formatUsdCompact } from "@/lib/format";
import type { PublicSnapshot, PublicToken } from "@/lib/market/public";

const getJson = (u: string) => fetch(u).then((r) => r.json());

export default function DemoPage() {
  const { data } = useSWR<PublicSnapshot>("/api/demo", getJson, { refreshInterval: 30_000 });
  const [selected, setSelected] = useState(0);
  const [found, setFound] = useState<PublicToken[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const list = [...found, ...(data?.tokens ?? []).filter((x) => !found.some((f) => f.address === x.address && f.chain_id === x.chain_id))];
  const t = list[Math.min(selected, Math.max(list.length - 1, 0))];

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const a = query.trim();
    if (!a) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/demo/lookup?address=${encodeURIComponent(a)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "No se pudo analizar el token.");
      const results = body.tokens as PublicToken[];
      // Most liquid chain first; keep previous searches below.
      setFound((prev) => [...results, ...prev.filter((p) => !results.some((r) => r.address === p.address && r.chain_id === p.chain_id))].slice(0, 6));
      setSelected(0);
      setQuery("");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Error");
    } finally {
      setSearching(false);
    }
  }

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

        <form onSubmit={search} className="mb-5 rounded-xl border border-line bg-panel p-4">
          <label htmlFor="demo-search" className="text-sm font-medium">Analiza cualquier token</label>
          <p className="mt-0.5 text-xs text-muted">Pega la contract address (Solana, Ethereum, Base, BNB…) y mira su puntuación de riesgo al momento, sin registrarte.</p>
          <div className="mt-3 flex gap-2">
            <Input
              id="demo-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Contract address"
              spellCheck={false}
              autoComplete="off"
              className="num text-[13px]"
            />
            <Button type="submit" variant="primary" loading={searching} disabled={!query.trim()}>
              <Search size={14} /> Analizar
            </Button>
          </div>
          {searchError && <div className="mt-3"><ErrorNote>{searchError}</ErrorNote></div>}
        </form>

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
                    {list.map((x, i) => (
                      <tr key={`${x.chain_id}:${x.address}`} onClick={() => setSelected(i)} className={cn("cursor-pointer border-b border-line last:border-0 hover:bg-panel-2/60", i === selected && "bg-panel-2/70")}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <TokenAvatar src={x.image_url} symbol={x.symbol} />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium">{x.symbol}</p>
                                {found.some((f) => f.address === x.address && f.chain_id === x.chain_id) && <Badge>tu búsqueda</Badge>}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <ChainTag chain={x.chain_id} />
                                <p className="max-w-[120px] truncate text-[11px] text-faint">{x.name}</p>
                              </div>
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
            />
            <div className="p-4">
              {t ? (
                <>
                  <RiskGauge score={t.risk_score} coverage={t.risk_coverage} />
                  <OpenIn chainId={t.chain_id} address={t.address} pairUrl={t.pair_url} className="mt-4 justify-center" />
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
