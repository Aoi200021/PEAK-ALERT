import Link from "next/link";
import { Logo } from "./brand";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/demo" className="hidden rounded-md px-3 py-1.5 text-muted hover:text-text sm:block">Demo</Link>
          <Link href="/pricing" className="rounded-md px-3 py-1.5 text-muted hover:text-text">Precios</Link>
          <Link href="/login" className="rounded-md px-3 py-1.5 text-muted hover:text-text">Entrar</Link>
          <Link href="/signup" className="rounded-md bg-text px-3 py-1.5 font-medium text-bg hover:bg-white">Crear cuenta</Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-xs text-faint md:flex-row md:justify-between">
        <p className="max-w-2xl leading-relaxed">
          PeakAlert es una herramienta de monitoreo y análisis. La puntuación de riesgo y las alertas se basan en reglas transparentes
          sobre datos públicos de mercado; no son asesoramiento financiero ni predicciones. Los memecoins son extremadamente volátiles y
          puedes perder todo lo invertido. PeakAlert no ejecuta operaciones ni accede a tus wallets.
        </p>
        <div className="flex gap-4">
          <Link href="/pricing" className="hover:text-muted">Precios</Link>
          <Link href="/demo" className="hover:text-muted">Demo</Link>
          <a href="https://dexscreener.com" target="_blank" rel="noreferrer" className="hover:text-muted">Datos: DexScreener</a>
        </div>
      </div>
    </footer>
  );
}
