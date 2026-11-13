"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Check, Minus } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { Button, ErrorNote, InfoNote, cn } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import type { MeResponse } from "@/lib/client/types";
import { COMPARISON, PLANS, type PlanId } from "@/lib/plans";

const ORDER: PlanId[] = ["free", "pro", "premium"];

/** /api/me without the 401 redirect of the default fetcher (this page is public). */
async function meOrNull(): Promise<MeResponse | null> {
  const res = await fetch("/api/me");
  return res.ok ? res.json() : null;
}

export default function PricingPage() {
  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <Suspense>
        <Pricing />
      </Suspense>
      <PublicFooter />
    </div>
  );
}

function Pricing() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: status } = useSWR<{ enabled: boolean }>("/api/billing/status", (u: string) => fetch(u).then((r) => r.json()));
  const { data: me } = useSWR("me-optional", meOrNull);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function subscribe(plan: PlanId) {
    setError(null);
    if (!me) {
      router.push(`/signup?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    setBusy(plan);
    try {
      const path = me.subscription.status && ["active", "trialing", "past_due"].includes(me.subscription.status) ? "/api/billing/portal" : "/api/billing/checkout";
      const r = await api<{ url: string }>(path, { method: "POST", json: path.endsWith("checkout") ? { plan } : {} });
      window.location.assign(r.url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo iniciar el pago.");
      setBusy(null);
    }
  }

  const current = me?.plan.id;

  return (
    <main className="mx-auto max-w-6xl px-5 pb-20 pt-14">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Protege tus ganancias por menos que una comisión de swap</h1>
        <p className="mt-3 text-muted">Empieza gratis. Pasa a Pro o Premium cuando necesites más tokens, alertas avanzadas y Profit Protection.</p>
      </div>

      {params.get("billing") === "cancelled" && <div className="mx-auto mt-6 max-w-xl"><InfoNote>Pago cancelado. No se realizó ningún cargo.</InfoNote></div>}
      {status && !status.enabled && (
        <div className="mx-auto mt-6 max-w-xl">
          <InfoNote tone="warn">Los pagos todavía no están habilitados. Puedes crear una cuenta gratis; los planes de pago se activarán pronto.</InfoNote>
        </div>
      )}
      {error && <div className="mx-auto mt-6 max-w-xl"><ErrorNote>{error}</ErrorNote></div>}

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {ORDER.map((id) => {
          const p = PLANS[id];
          const featured = id === "pro";
          const isCurrent = current === id;
          return (
            <div key={id} className={cn("rise relative flex flex-col rounded-xl border bg-panel p-6", featured ? "border-text/30 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_60px_-30px_rgba(46,189,133,0.35)]" : "border-line")}>
              {featured && <span className="absolute -top-2.5 left-6 rounded-full bg-text px-2.5 py-0.5 text-[11px] font-medium text-bg">Más popular</span>}
              <h2 className="text-lg font-medium">{p.name}</h2>
              <p className="mt-1 min-h-10 text-sm text-muted">{p.tagline}</p>
              <p className="mt-5">
                <span className="num text-4xl font-medium tracking-tight">${p.priceUsd}</span>
                <span className="text-sm text-faint"> USD / mes</span>
              </p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-muted">
                    <Check size={15} className="mt-0.5 shrink-0 text-up" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                {isCurrent ? (
                  <Button className="w-full" disabled>Tu plan actual</Button>
                ) : id === "free" ? (
                  me ? (
                    <Button className="w-full" disabled>Incluido</Button>
                  ) : (
                    <Link href="/signup"><Button className="w-full">Empezar gratis</Button></Link>
                  )
                ) : status?.enabled ? (
                  <Button variant={featured ? "primary" : "secondary"} className="w-full" loading={busy === id} onClick={() => subscribe(id)}>
                    {me ? `Elegir ${p.name}` : `Crear cuenta y elegir ${p.name}`}
                  </Button>
                ) : (
                  <Button className="w-full" disabled title="Pagos aún no disponibles">Próximamente</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison */}
      <div className="mt-16 overflow-hidden rounded-xl border border-line">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line bg-panel text-left">
                <th className="px-5 py-3.5 font-medium">Comparar planes</th>
                {ORDER.map((id) => (
                  <th key={id} className="px-4 py-3.5 text-center font-medium">
                    {PLANS[id].name}
                    <span className="num block text-xs font-normal text-faint">${PLANS[id].priceUsd}/mes</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 text-muted">{row.label}</td>
                  {row.values.map((v, i) => (
                    <td key={i} className="px-4 py-3 text-center">
                      {v === true ? <Check size={16} className="mx-auto text-up" /> : v === false ? <Minus size={16} className="mx-auto text-faint" /> : <span className="num">{v}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mx-auto mt-14 grid max-w-4xl gap-6 text-sm md:grid-cols-2">
        <Faq q="¿Puedo cancelar cuando quiera?" a="Sí. Las suscripciones son mensuales y se gestionan desde Ajustes → Gestionar suscripción (Stripe). Al cancelar vuelves al plan Free al final del periodo." />
        <Faq q="¿PeakAlert predice el máximo?" a="No. Calcula una puntuación de riesgo con reglas transparentes y te avisa cuando se cumplen tus condiciones. El mercado puede comportarse de forma distinta." />
        <Faq q="¿Necesito conectar mi wallet?" a="No. Solo pegas la dirección del token y, si quieres, registras tu precio de entrada. PeakAlert nunca accede a tus fondos ni opera por ti." />
        <Faq q="¿De dónde salen los datos?" a="De DexScreener (y opcionalmente Birdeye para Solana). PeakAlert guarda su propio historial para medir máximos, liquidez y tendencia." />
      </div>
    </main>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <p className="font-medium">{q}</p>
      <p className="mt-2 leading-relaxed text-muted">{a}</p>
    </div>
  );
}
