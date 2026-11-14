"use client";

import Link from "next/link";
import { Logo } from "./brand";
import { LanguageSwitcher } from "./language-switcher";
import { useI18n } from "@/lib/i18n/client";

export function PublicHeader() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-5">
        <Logo />
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/demo" className="hidden rounded-md px-3 py-1.5 text-muted hover:text-text sm:block">Demo</Link>
          <Link href="/pricing" className="hidden rounded-md px-3 py-1.5 text-muted hover:text-text sm:block">{t("Pricing", "Precios")}</Link>
          <Link href="/login" className="rounded-md px-3 py-1.5 text-muted hover:text-text">{t("Log in", "Entrar")}</Link>
          <Link href="/signup" className="rounded-md bg-text px-3 py-1.5 font-medium whitespace-nowrap text-bg hover:bg-white">{t("Sign up", "Crear cuenta")}</Link>
          <LanguageSwitcher className="ml-1 hidden md:inline-flex" />
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-xs text-faint md:flex-row md:justify-between">
        <p className="max-w-2xl leading-relaxed">
          {t(
            "PeakAlert is a monitoring and analysis tool. The risk score and alerts are based on transparent rules applied to public market data; they are not financial advice or predictions. Memecoins are extremely volatile and you can lose everything you invest. PeakAlert never executes trades or accesses your wallets.",
            "PeakAlert es una herramienta de monitoreo y análisis. La puntuación de riesgo y las alertas se basan en reglas transparentes sobre datos públicos de mercado; no son asesoramiento financiero ni predicciones. Los memecoins son extremadamente volátiles y puedes perder todo lo invertido. PeakAlert no ejecuta operaciones ni accede a tus wallets.",
          )}
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/pricing" className="hover:text-muted">{t("Pricing", "Precios")}</Link>
          <Link href="/demo" className="hover:text-muted">Demo</Link>
          <Link href="/terms" className="hover:text-muted">{t("Terms", "Términos")}</Link>
          <Link href="/privacy" className="hover:text-muted">{t("Privacy", "Privacidad")}</Link>
          <Link href="/refunds" className="hover:text-muted">{t("Refunds", "Reembolsos")}</Link>
          <a href="https://dexscreener.com" target="_blank" rel="noreferrer" className="hover:text-muted">{t("Data: DexScreener", "Datos: DexScreener")}</a>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}
