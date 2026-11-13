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
import { useI18n } from "@/lib/i18n/client";
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
  const { t, p } = useI18n();
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
      const active = me.subscription.status && ["active", "trialing", "past_due"].includes(me.subscription.status);
      const path = active ? "/api/billing/portal" : "/api/billing/checkout";
      const r = await api<{ url: string }>(path, { method: "POST", json: active ? {} : { plan } });
      window.location.assign(r.url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("Couldn't start the checkout.", "No se pudo iniciar el pago."));
      setBusy(null);
    }
  }

  const current = me?.plan.id;

  return (
    <main className="mx-auto max-w-6xl px-5 pb-20 pt-14">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {t("Protect your gains for less than a swap fee", "Protege tus ganancias por menos que una comisión de swap")}
        </h1>
        <p className="mt-3 text-muted">
          {t(
            "Start free. Upgrade to Pro or Premium when you need more tokens, advanced alerts and Profit Protection.",
            "Empieza gratis. Pasa a Pro o Premium cuando necesites más tokens, alertas avanzadas y Profit Protection.",
          )}
        </p>
      </div>

      {params.get("billing") === "cancelled" && (
        <div className="mx-auto mt-6 max-w-xl">
          <InfoNote>{t("Checkout cancelled. You weren't charged.", "Pago cancelado. No se realizó ningún cargo.")}</InfoNote>
        </div>
      )}
      {status && !status.enabled && (
        <div className="mx-auto mt-6 max-w-xl">
          <InfoNote tone="warn">
            {t(
              "Payments aren't enabled yet. You can create a free account; paid plans will be available soon.",
              "Los pagos todavía no están habilitados. Puedes crear una cuenta gratis; los planes de pago se activarán pronto.",
            )}
          </InfoNote>
        </div>
      )}
      {error && (
        <div className="mx-auto mt-6 max-w-xl">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {ORDER.map((id) => {
          const plan = PLANS[id];
          const featured = id === "pro";
          const isCurrent = current === id;
          return (
            <div
              key={id}
              className={cn(
                "rise relative flex flex-col rounded-xl border bg-panel p-6",
                featured ? "border-text/30 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_60px_-30px_rgba(46,189,133,0.35)]" : "border-line",
              )}
            >
              {featured && (
                <span className="absolute -top-2.5 left-6 rounded-full bg-text px-2.5 py-0.5 text-[11px] font-medium text-bg">
                  {t("Most popular", "Más popular")}
                </span>
              )}
              <h2 className="text-lg font-medium">{plan.name}</h2>
              <p className="mt-1 min-h-10 text-sm text-muted">{p(plan.tagline)}</p>
              <p className="mt-5">
                <span className="num text-4xl font-medium tracking-tight">${plan.priceUsd}</span>
                <span className="text-sm text-faint"> USD / {t("month", "mes")}</span>
              </p>
              <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                {plan.features.map((f) => (
                  <li key={f.en} className="flex gap-2 text-muted">
                    <Check size={15} className="mt-0.5 shrink-0 text-up" /> {p(f)}
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                {isCurrent ? (
                  <Button className="w-full" disabled>
                    {t("Your current plan", "Tu plan actual")}
                  </Button>
                ) : id === "free" ? (
                  me ? (
                    <Button className="w-full" disabled>
                      {t("Included", "Incluido")}
                    </Button>
                  ) : (
                    <Link href="/signup">
                      <Button className="w-full">{t("Start free", "Empezar gratis")}</Button>
                    </Link>
                  )
                ) : status?.enabled ? (
                  <Button variant={featured ? "primary" : "secondary"} className="w-full" loading={busy === id} onClick={() => subscribe(id)}>
                    {me ? t(`Choose ${plan.name}`, `Elegir ${plan.name}`) : t(`Sign up and choose ${plan.name}`, `Crear cuenta y elegir ${plan.name}`)}
                  </Button>
                ) : (
                  <Button className="w-full" disabled title={t("Payments not available yet", "Pagos aún no disponibles")}>
                    {t("Coming soon", "Próximamente")}
                  </Button>
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
                <th className="px-5 py-3.5 font-medium">{t("Compare plans", "Comparar planes")}</th>
                {ORDER.map((id) => (
                  <th key={id} className="px-4 py-3.5 text-center font-medium">
                    {PLANS[id].name}
                    <span className="num block text-xs font-normal text-faint">
                      ${PLANS[id].priceUsd}/{t("mo", "mes")}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label.en} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 text-muted">{p(row.label)}</td>
                  {row.values.map((v, i) => (
                    <td key={i} className="px-4 py-3 text-center">
                      {v === true ? (
                        <Check size={16} className="mx-auto text-up" />
                      ) : v === false ? (
                        <Minus size={16} className="mx-auto text-faint" />
                      ) : (
                        <span className="num">{p(v)}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mx-auto mt-14 grid max-w-4xl gap-6 text-sm md:grid-cols-2">
        <Faq
          q={t("Can I cancel anytime?", "¿Puedo cancelar cuando quiera?")}
          a={t(
            "Yes. Subscriptions are monthly and managed from Settings → Manage subscription (Stripe). When you cancel, you go back to Free at the end of the period.",
            "Sí. Las suscripciones son mensuales y se gestionan desde Ajustes → Gestionar suscripción (Stripe). Al cancelar vuelves al plan Free al final del periodo.",
          )}
        />
        <Faq
          q={t("Does PeakAlert predict the top?", "¿PeakAlert predice el máximo?")}
          a={t(
            "No. It computes a risk score with transparent rules and alerts you when your conditions are met. The market can behave differently.",
            "No. Calcula una puntuación de riesgo con reglas transparentes y te avisa cuando se cumplen tus condiciones. El mercado puede comportarse de forma distinta.",
          )}
        />
        <Faq
          q={t("Do I need to connect my wallet?", "¿Necesito conectar mi wallet?")}
          a={t(
            "No. You just paste the token address and, optionally, record your entry price. PeakAlert never touches your funds or trades for you.",
            "No. Solo pegas la dirección del token y, si quieres, registras tu precio de entrada. PeakAlert nunca accede a tus fondos ni opera por ti.",
          )}
        />
        <Faq
          q={t("Where does the data come from?", "¿De dónde salen los datos?")}
          a={t(
            "From DexScreener (and optionally Birdeye for Solana). PeakAlert keeps its own history to measure highs, liquidity and trend.",
            "De DexScreener (y opcionalmente Birdeye para Solana). PeakAlert guarda su propio historial para medir máximos, liquidez y tendencia.",
          )}
        />
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
