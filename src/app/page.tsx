import Link from "next/link";
import { Activity, BellRing, Check, ShieldCheck, Star } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/public-header";
import { ALERT_META, ALERT_TYPES } from "@/lib/alerts/types";
import { getLocale } from "@/lib/i18n/server";
import { PLANS, type PlanId } from "@/lib/plans";
import { FACTOR_LABELS, FACTOR_WEIGHTS } from "@/lib/risk/score";

export default async function Home() {
  const locale = await getLocale();
  const t = (en: string, es: string) => (locale === "es" ? es : en);

  const pillars = [
    { Icon: Activity, title: "Peak Detection", desc: t("A 0–100 exhaustion risk score built from 8 explained signals.", "Puntuación 0–100 de riesgo de agotamiento con 8 señales explicadas.") },
    { Icon: BellRing, title: "Smart Alerts", desc: t("10 configurable alert types, no spam: one alert per event.", "10 tipos de alerta configurables, sin spam: un aviso por evento.") },
    { Icon: ShieldCheck, title: "Profit Protection", desc: t("ROI, max profit, how much you've given back, and trailing stops.", "ROI, beneficio máximo, cuánto has devuelto y trailing stops.") },
    { Icon: Star, title: "Watchlist", desc: t("Price, market cap, volume, liquidity and risk for every token.", "Precio, market cap, volumen, liquidez y riesgo de cada token.") },
  ];

  return (
    <div className="min-h-dvh">
      <PublicHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="grid-backdrop pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-[1.05fr_1fr] md:pt-20">
          <div className="rise">
            <p className="num mb-4 inline-flex items-center gap-2 rounded-full border border-line-strong bg-panel px-3 py-1 text-[11px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-up pulse-dot" /> Peak Detection · Solana, Base, Ethereum, BNB {t("and more", "y más")}
            </p>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight md:text-[54px]">
              {t("Don't give your gains", "No devuelvas tus ganancias")}
              <br />
              <span className="text-muted">{t("back to the market.", "al mercado.")}</span>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
              {t(
                "PeakAlert watches your memecoins and alerts you when exhaustion signals show up: momentum stalls, volume dries up, sell pressure builds or price gets rejected at its high. You decide what to do — with data, not gut feeling.",
                "PeakAlert vigila tus memecoins y te avisa cuando aparecen señales de agotamiento: el momentum se frena, el volumen se seca, aumenta la presión de venta o el precio rechaza su máximo. Tú decides qué hacer — con información, no con intuición.",
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-md bg-text px-4 py-2.5 text-sm font-medium text-bg hover:bg-white">
                {t("Start free", "Empezar gratis")}
              </Link>
              <Link href="/demo" className="rounded-md border border-line-strong px-4 py-2.5 text-sm text-text hover:bg-panel">
                {t("Try the live demo", "Ver demo con datos reales")}
              </Link>
            </div>
            <p className="mt-4 text-xs text-faint">
              {t("Free for up to 3 tokens · no card · no wallet connection", "Gratis hasta 3 tokens · sin tarjeta · sin conectar tu wallet")}
            </p>
          </div>
          <HeroIllustration t={t} />
        </div>
      </section>

      {/* Pillars */}
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-px px-5 py-16 md:grid-cols-4">
          {pillars.map(({ Icon, title, desc }) => (
            <div key={title} className="rounded-lg p-5">
              <Icon size={18} className="text-text" strokeWidth={1.7} />
              <h3 className="mt-3 font-medium">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Score */}
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-[1fr_1.2fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{t("A score that explains itself", "Una puntuación que se explica sola")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {t(
                "Peak Detection combines eight signals traders watch near local tops. Each one has its own weight, value and plain-language explanation. If there isn't enough history for a signal, it's excluded and flagged — never made up.",
                "Peak Detection combina ocho señales que los traders vigilan cerca de los máximos locales. Cada una tiene su peso, su valor y una explicación en lenguaje claro. Si falta historial para una señal, se excluye y se indica — nunca se inventa.",
              )}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
              {[
                ["0–30", t("Healthy momentum", "Momentum saludable"), "text-up"],
                ["31–60", t("Caution", "Precaución"), "text-warn"],
                ["61–80", t("Elevated risk", "Riesgo elevado"), "text-orange"],
                ["81–100", t("Very high risk", "Riesgo muy elevado"), "text-down"],
              ].map(([r, l, c]) => (
                <div key={r} className="rounded-md border border-line bg-panel px-3 py-2">
                  <span className={`num ${c}`}>{r}</span> <span className="text-muted">{l}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-faint">
              {t(
                "It's a transparent heuristic model, not a trained AI or a probability. It does not predict the top with certainty.",
                "Es un modelo heurístico transparente, no una IA entrenada ni una probabilidad. No predice el máximo con certeza.",
              )}
            </p>
          </div>
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {(Object.keys(FACTOR_WEIGHTS) as (keyof typeof FACTOR_WEIGHTS)[]).map((k) => (
              <li key={k} className="flex items-center gap-4 px-5 py-3">
                <span className="flex-1 text-sm">{FACTOR_LABELS[k][locale]}</span>
                <div className="h-1 w-24 overflow-hidden rounded-full bg-panel-2">
                  <div className="h-full bg-muted" style={{ width: `${FACTOR_WEIGHTS[k] * 5}%` }} />
                </div>
                <span className="num w-10 text-right text-xs text-faint">{FACTOR_WEIGHTS[k]}%</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Alerts */}
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{t("Alerts that tell you why", "Alertas que dicen por qué")}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {t(
                "Every alert explains what's happening, why it fired, which indicators changed, what risk it represents and what you could watch. Delivered as push notifications to your desktop or phone.",
                "Cada aviso explica qué está pasando, por qué se generó, qué indicadores cambiaron, qué riesgo representa y qué podrías vigilar. Se envían como notificación push a tu ordenador o móvil.",
              )}
            </p>
            <Link href="/demo" className="mt-5 inline-block text-sm text-text underline underline-offset-4">
              {t("See an example alert →", "Ver un ejemplo de alerta →")}
            </Link>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
            {ALERT_TYPES.map((type) => (
              <li key={type} className="bg-panel px-4 py-3.5">
                <p className="text-sm font-medium">{ALERT_META[type].label[locale]}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{ALERT_META[type].description[locale]}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Protection */}
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-20 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Profit Protection</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {t(
                "Record your entry (price or market cap) and how much you invested. PeakAlert calculates your ROI, the max profit you reached, how much you've given back since, and how much you'd have kept with different trailing stops.",
                "Registra tu entrada (precio o market cap) y el monto invertido. PeakAlert calcula tu ROI, el beneficio máximo que llegaste a tener, cuánto has devuelto desde entonces y cuánto habrías conservado con distintos trailing stops.",
              )}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-panel p-5 text-sm">
            <p className="text-[11px] uppercase tracking-wide text-faint">{t("Illustrative example", "Ejemplo ilustrativo")}</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                [t("Invested", "Invertido"), "$500", ""],
                [t("Max profit", "Máx. beneficio"), "+$1,840", "text-up"],
                [t("Now", "Ahora"), "+$720", "text-up"],
              ].map(([k, v, c]) => (
                <div key={k}>
                  <p className="text-[11px] text-faint">{k}</p>
                  <p className={`num mt-1 text-lg ${c}`}>{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-down/30">
              <div className="h-full bg-up" style={{ width: "39%" }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              {t(
                "You've given back 61% of your max profit · a 25% trailing stop would have kept +$1,210",
                "Has devuelto el 61% del beneficio máximo · trailing 25% habría conservado +$1,210",
              )}
            </p>
            <p className="mt-3 text-[11px] text-faint">{t("Example values, not real data.", "Valores de ejemplo, no datos reales.")}</p>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">{t("Plans", "Planes")}</h2>
            <Link href="/pricing" className="text-sm text-muted hover:text-text">
              {t("Compare plans →", "Comparar planes →")}
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {(Object.keys(PLANS) as PlanId[]).map((id) => (
              <div key={id} className={`rounded-lg border bg-panel p-6 ${id === "pro" ? "border-text/30" : "border-line"}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-medium">{PLANS[id].name}</h3>
                  <p>
                    <span className="num text-2xl">${PLANS[id].priceUsd}</span>
                    <span className="text-xs text-faint"> /{t("mo", "mes")}</span>
                  </p>
                </div>
                <ul className="mt-5 space-y-2.5 text-sm">
                  {PLANS[id].features.slice(0, 4).map((f) => (
                    <li key={f.en} className="flex gap-2 text-muted">
                      <Check size={14} className="mt-0.5 shrink-0 text-up" /> {f[locale]}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}

/** Schematic chart: a pump, rejections at the high, and an exhaustion alert. Purely illustrative. */
function HeroIllustration({ t }: { t: (en: string, es: string) => string }) {
  const path =
    "M0,210 C40,205 60,198 90,186 C120,172 135,140 160,112 C180,88 196,58 214,48 C226,42 236,46 244,62 C252,76 258,72 266,56 C274,44 284,42 292,52 C300,64 306,84 318,96 C334,112 350,122 370,140 C388,156 404,160 420,168";
  return (
    <div className="rise rounded-xl border border-line bg-panel/80 p-4 shadow-2xl shadow-black/40 backdrop-blur" style={{ animationDelay: "0.1s" }}>
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-panel-2 ring-1 ring-line" />
          <span className="text-sm font-medium">TOKEN</span>
          <span className="rounded bg-panel-2 px-1.5 text-[10px] uppercase text-faint ring-1 ring-line">{t("example", "ejemplo")}</span>
        </div>
        <span className="num inline-flex items-center gap-1.5 rounded-md bg-orange/10 px-2 py-0.5 text-xs text-orange ring-1 ring-orange/25">
          <span className="h-1.5 w-1.5 rounded-full bg-orange" /> {t("Risk", "Riesgo")} 74
        </span>
      </div>
      <svg viewBox="0 0 420 230" className="mt-3 w-full" aria-label={t("Illustration of an exhaustion alert", "Ilustración de una alerta de agotamiento")}>
        <defs>
          <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#2ebd85" stopOpacity="0.22" />
            <stop offset="1" stopColor="#2ebd85" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[50, 100, 150, 200].map((y) => (
          <line key={y} x1="0" x2="420" y1={y} y2={y} stroke="rgba(255,255,255,0.04)" />
        ))}
        <path d={`${path} L420,230 L0,230 Z`} fill="url(#g)" />
        <path d={path} fill="none" stroke="#2ebd85" strokeWidth="2" />
        <line x1="0" x2="420" y1="42" y2="42" stroke="#8c929b" strokeDasharray="3 4" strokeWidth="1" />
        <text x="4" y="35" fill="#8c929b" fontSize="10" fontFamily="var(--font-geist-mono)">
          {t("high · 2 rejections", "máximo · 2 rechazos")}
        </text>
        <circle cx="218" cy="46" r="3" fill="#e8b14a" />
        <circle cx="282" cy="43" r="3" fill="#e8b14a" />
        <circle cx="318" cy="96" r="4" fill="#f0883e" />
        <g transform="translate(250,118)">
          <rect width="160" height="54" rx="7" fill="#14171b" stroke="#2a2f37" />
          <text x="10" y="18" fill="#f0883e" fontSize="11" fontFamily="var(--font-geist-mono)">
            {t("Exhaustion 74/100", "Agotamiento 74/100")}
          </text>
          <text x="10" y="33" fill="#8c929b" fontSize="9.5">
            {t("sells > buys · volume −45%", "ventas > compras · volumen −45%")}
          </text>
          <text x="10" y="46" fill="#8c929b" fontSize="9.5">
            {t("alert sent", "alerta enviada")}
          </text>
        </g>
      </svg>
    </div>
  );
}
