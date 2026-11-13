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
import { useI18n } from "@/lib/i18n/client";

const getJson = (u: string) => fetch(u).then((r) => r.json());

export default function DemoPage() {
  const { t: tr, p: pl } = useI18n();
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
      setSearchError(err instanceof Error ? err.message : tr("Error", "Error"));
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
              <p className="font-semibold">{tr("DEMO DATA", "DATOS DE DEMOSTRACIÓN")}</p>
              <p className="mt-0.5 text-warn/80">
                {tr(
                  "The market API is unreachable right now. The tokens and values on this page are fictitious and only illustrate the interface.",
                  "No hay conexión con la API de mercado en este momento. Los tokens y valores de esta página son ficticios y solo ilustran la interfaz.",
                )}
              </p>
            </div>
          </div>
        ) : data ? (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-sm">
            <Radio size={18} className="mt-0.5 shrink-0 text-up" />
            <div className="text-muted">
              <p className="font-medium text-text">{tr("Live data from DexScreener", "Datos reales de DexScreener")}</p>
              <p className="mt-0.5">
                {tr(
                  "Public preview. Here the score only uses current data; with an account, PeakAlert also records each token's history (highs, rejections, liquidity) and the score is more complete.",
                  "Vista previa pública. Aquí la puntuación usa solo los datos actuales; con una cuenta, PeakAlert también registra el historial de cada token (máximos, rechazos, liquidez) y la puntuación es más completa.",
                )}
              </p>
            </div>
            <DataAge at={data.fetchedAt} className="ml-auto shrink-0" />
          </div>
        ) : (
          <Skeleton className="mb-6 h-16 w-full" />
        )}

        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{tr("Live Peak Detection", "Peak Detection en vivo")}</h1>
            <p className="mt-1 text-sm text-muted">{tr("Momentum-exhaustion risk (0–100) for popular Solana memecoins.", "Riesgo de agotamiento del impulso (0–100) de memecoins populares de Solana.")}</p>
          </div>
          <Link href="/signup" className="rounded-md bg-text px-4 py-2 text-sm font-medium text-bg hover:bg-white">{tr("Track my tokens free", "Monitorear mis tokens gratis")}</Link>
        </div>

        <form onSubmit={search} className="mb-5 rounded-xl border border-line bg-panel p-4">
          <label htmlFor="demo-search" className="text-sm font-medium">{tr("Analyze any token", "Analiza cualquier token")}</label>
          <p className="mt-0.5 text-xs text-muted">
            {tr(
              "Paste a contract address or link (any chain on DexScreener) and see its risk score instantly — no sign-up.",
              "Pega la contract address o un enlace (cualquier red de DexScreener) y mira su puntuación de riesgo al momento, sin registrarte.",
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              id="demo-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("Contract address or DexScreener / Pump.fun link", "Contract address o enlace de DexScreener / Pump.fun")}
              spellCheck={false}
              autoComplete="off"
              className="num text-[13px]"
            />
            <Button type="submit" variant="primary" loading={searching} disabled={!query.trim()}>
              <Search size={14} /> {tr("Analyze", "Analizar")}
            </Button>
          </div>
          {searchError && <div className="mt-3"><ErrorNote>{searchError}</ErrorNote></div>}
        </form>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <Panel className="overflow-hidden">
            <PanelHeader title="Tokens" sub={tr("Select one to see the full analysis", "Selecciona uno para ver el detalle del análisis")} />
            {!data ? (
              <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-faint">
                      <th className="px-4 py-2.5 font-medium">Token</th>
                      <th className="px-3 py-2.5 text-right font-medium">{tr("Price", "Precio")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">1h</th>
                      <th className="px-3 py-2.5 text-right font-medium">24h</th>
                      <th className="px-3 py-2.5 text-right font-medium">Market cap</th>
                      <th className="px-3 py-2.5 text-right font-medium">{tr("Liquidity", "Liquidez")}</th>
                      <th className="px-3 py-2.5 text-right font-medium">{tr("Risk", "Riesgo")}</th>
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
                                {found.some((f) => f.address === x.address && f.chain_id === x.chain_id) && <Badge>{tr("your search", "tu búsqueda")}</Badge>}
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
                    {t.risk_factors.length ? <RiskFactors factors={t.risk_factors} /> : <p className="text-xs text-muted">{tr("Breakdown not available in demo mode.", "Desglose no disponible en modo demostración.")}</p>}
                  </div>
                </>
              ) : (
                <Skeleton className="h-64" />
              )}
              <p className="mt-4 text-[11px] leading-relaxed text-faint">{pl(RISK_DISCLAIMER)}</p>
            </div>
          </Panel>
        </div>

        <div className="mt-12">
          <h2 className="text-lg font-semibold tracking-tight">{tr("How every alert explains itself", "Así se explica cada alerta")}</h2>
          <p className="mt-1 text-sm text-muted">
            {tr(
              "Illustrative example (not a real token): every alert says what's happening, why it fired, which indicators changed, what risk it represents and what to watch.",
              "Ejemplo ilustrativo (no corresponde a un token real): cada aviso dice qué pasa, por qué se generó, qué indicadores cambiaron, qué riesgo representa y qué vigilar.",
            )}
          </p>
          <div className="mt-4 rounded-xl border border-line bg-panel p-4">
            <p className="mb-3 text-sm font-medium">{tr("EXAMPLE: Exhaustion risk 78/100", "EJEMPLO: Riesgo de agotamiento 78/100")}</p>
            <AlertExplanationCard
              e={{
                what: tr("Several indicators show typical signs of an exhausted rally.", "Varios indicadores muestran señales típicas de agotamiento del impulso alcista."),
                why: tr("The risk score (78/100) went above your threshold of 70.", "La puntuación de riesgo (78/100) superó tu umbral de 70."),
                indicators: [
                  { label: tr("Sell pressure", "Presión de venta"), value: tr("1.9 sells per buy · 82/100", "1.9 ventas por compra · 82/100"), tone: "down" },
                  { label: tr("Rejections at the high", "Rechazos del máximo"), value: tr("2 rejections · 65/100", "2 rechazos · 65/100"), tone: "warn" },
                  { label: tr("Volume decline", "Caída del volumen"), value: tr("38% of average · 70/100", "38% del promedio · 70/100"), tone: "warn" },
                  { label: tr("Momentum loss", "Pérdida de momentum"), value: "1h −6% · 6h +140%", tone: "down" },
                ],
                risk: tr(
                  "The score summarizes observed signals; it is not the probability that price will fall. This is a signal based on market data, not a prediction: the price may recover.",
                  "La puntuación resume señales observadas; no es la probabilidad de que el precio caiga. Es una señal basada en datos de mercado, no una predicción: el precio puede recuperarse.",
                ),
                watch: [
                  tr("Which factors keep rising in the token's detail view.", "Qué factores siguen subiendo en el detalle del token."),
                  tr("Whether the score drops again (momentum recovering).", "Si la puntuación baja de nuevo (el impulso se recupera)."),
                  tr("Your trailing stop level if you hold a position.", "Tu nivel de trailing stop si tienes una posición."),
                ],
              }}
            />
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
