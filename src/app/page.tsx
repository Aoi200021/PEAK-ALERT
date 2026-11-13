import Link from "next/link";
import { Check } from "lucide-react";
import { DISCLAIMER, Logo } from "@/components/brand";
import { ALERT_META, ALERT_TYPES } from "@/lib/alerts/types";
import { PLANS, type PlanId } from "@/lib/plans";

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/login" className="rounded-md px-3 py-1.5 text-muted hover:text-text">
            Entrar
          </Link>
          <Link href="/signup" className="rounded-md bg-text px-3 py-1.5 font-medium text-bg hover:bg-white">
            Crear cuenta
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="grid-backdrop pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 md:grid-cols-[1.05fr_1fr] md:pt-24">
          <div>
            <p className="num mb-4 inline-flex items-center gap-2 rounded-full border border-line-strong bg-panel px-3 py-1 text-[11px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-up" /> Beta · Solana, Base, Ethereum, BNB y más
            </p>
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight md:text-[56px]">
              Sabe cuándo tu memecoin
              <br />
              <span className="text-muted">empieza a perder fuerza.</span>
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
              PeakAlert vigila los tokens que sigues y te avisa cuando caen desde su máximo, se seca el volumen o cambia el momentum — con
              reglas que tú defines. Sin promesas de predecir el techo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-md bg-text px-4 py-2.5 text-sm font-medium text-bg hover:bg-white">
                Empezar gratis
              </Link>
              <a href="#como-funciona" className="rounded-md border border-line-strong px-4 py-2.5 text-sm text-text hover:bg-panel">
                Cómo funciona
              </a>
            </div>
          </div>
          <HeroIllustration />
        </div>
      </section>

      {/* How */}
      <section id="como-funciona" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">Cómo funciona</h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
            {[
              ["01", "Pega la contract address", "Validamos la dirección y traemos precio, liquidez, volumen y market cap desde DexScreener."],
              ["02", "Define tus reglas", "Ej: avísame si cae 15% desde el máximo después de pasar $1M de market cap."],
              ["03", "Recibe la alerta", "Notificación web push en tu ordenador o móvil, una sola vez por evento — sin spam."],
            ].map(([n, t, d]) => (
              <div key={n} className="bg-panel p-6">
                <p className="num text-xs text-faint">{n}</p>
                <h3 className="mt-3 font-medium">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Alerts */}
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 md:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Cinco señales, configurables</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Cada alerta se evalúa en el servidor con datos frescos. Se dispara una vez y se rearma solo cuando la condición desaparece o
              aparece un nuevo máximo.
            </p>
          </div>
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {ALERT_TYPES.map((t) => (
              <li key={t} className="flex gap-4 px-5 py-4">
                <span className="num mt-0.5 w-20 shrink-0 text-[11px] uppercase tracking-wide text-faint">{ALERT_META[t].short}</span>
                <div>
                  <p className="text-sm font-medium">{ALERT_META[t].label}</p>
                  <p className="mt-1 text-sm text-muted">{ALERT_META[t].description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Paper exit */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-10 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Paper Exit: ¿la alerta sirvió?</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Cada vez que se dispara una alerta registramos el precio. Después medimos qué pasó 1 hora, 24 horas y 7 días más tarde, para
                que veas si vender en ese momento habría sido mejor que mantener — y ajustes tus reglas con datos, no con intuición.
              </p>
            </div>
            <div className="rounded-lg border border-line bg-panel p-5 text-sm">
              <p className="text-[11px] uppercase tracking-wide text-faint">Ejemplo ilustrativo</p>
              <div className="mt-4 grid grid-cols-4 gap-3">
                {[
                  ["Alerta", "$0.0₄812", ""],
                  ["+1 h", "−6.2%", "down"],
                  ["+24 h", "−31.0%", "down"],
                  ["+7 d", "−58.4%", "down"],
                ].map(([k, v, tone]) => (
                  <div key={k}>
                    <p className="text-[11px] text-faint">{k}</p>
                    <p className={`num mt-1 ${tone === "down" ? "text-down" : ""}`}>{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-muted">Los valores de este recuadro son un ejemplo, no datos reales.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">Planes</h2>
          <p className="mt-2 text-sm text-muted">Durante la beta los planes de pago se activan manualmente. Precios por anunciar.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {(Object.keys(PLANS) as PlanId[]).map((id) => (
              <div key={id} className="rounded-lg border border-line bg-panel p-6">
                <h3 className="font-medium">{PLANS[id].name}</h3>
                <p className="mt-1 text-xs text-faint">{id === "free" ? "Gratis" : "Precio por definir"}</p>
                <ul className="mt-5 space-y-2.5 text-sm">
                  {PLANS[id].features.map((f) => (
                    <li key={f} className="flex gap-2 text-muted">
                      <Check size={14} className="mt-0.5 shrink-0 text-up" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <p className="max-w-3xl text-xs leading-relaxed text-faint">{DISCLAIMER}</p>
          <p className="mt-4 text-xs text-faint">
            Datos de mercado:{" "}
            <a href="https://dexscreener.com" target="_blank" rel="noreferrer" className="hover:text-muted">
              DexScreener
            </a>
            . PeakAlert no ejecuta operaciones ni tiene acceso a tus wallets.
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Schematic chart: a pump, a peak, and a drawdown alert. Purely illustrative. */
function HeroIllustration() {
  const path =
    "M0,210 C40,205 60,200 90,190 C120,178 135,150 160,128 C185,104 200,70 225,52 C240,42 252,40 262,44 C278,52 290,74 305,88 C322,104 340,112 360,130 C380,148 400,150 420,162";
  return (
    <div className="rounded-xl border border-line bg-panel/80 p-4 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-full bg-panel-2 ring-1 ring-line" />
          <span className="text-sm font-medium">TOKEN</span>
          <span className="rounded bg-panel-2 px-1.5 text-[10px] uppercase text-faint ring-1 ring-line">ejemplo</span>
        </div>
        <span className="text-[11px] text-faint">Ilustración</span>
      </div>
      <svg viewBox="0 0 420 230" className="mt-3 w-full" aria-label="Ilustración de una alerta de caída desde el máximo">
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
        <line x1="0" x2="420" y1="40" y2="40" stroke="#8c929b" strokeDasharray="3 4" strokeWidth="1" />
        <text x="4" y="34" fill="#8c929b" fontSize="10" fontFamily="var(--font-geist-mono)">máximo registrado</text>
        <circle cx="262" cy="44" r="3.5" fill="#e8eaed" />
        <line x1="305" x2="305" y1="40" y2="88" stroke="#f6465d" strokeWidth="1" />
        <circle cx="305" cy="88" r="4" fill="#f6465d" />
        <g transform="translate(316,62)">
          <rect width="96" height="38" rx="6" fill="#14171b" stroke="#2a2f37" />
          <text x="9" y="16" fill="#f6465d" fontSize="11" fontFamily="var(--font-geist-mono)">−15% desde máx.</text>
          <text x="9" y="30" fill="#8c929b" fontSize="9.5">alerta enviada</text>
        </g>
      </svg>
    </div>
  );
}
