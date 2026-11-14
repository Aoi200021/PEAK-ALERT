"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PublicFooter, PublicHeader } from "./public-header";
import { useI18n } from "@/lib/i18n/client";

/** Support email shown on legal pages. Set NEXT_PUBLIC_SUPPORT_EMAIL in Vercel. */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "";

export const LEGAL_UPDATED = { en: "November 14, 2026", es: "14 de noviembre de 2026" };

export function SupportContact() {
  const { t } = useI18n();
  return SUPPORT_EMAIL ? (
    <a href={`mailto:${SUPPORT_EMAIL}`} className="text-text underline underline-offset-2">
      {SUPPORT_EMAIL}
    </a>
  ) : (
    <span className="text-warn">{t("(support email coming soon)", "(email de soporte próximamente)")}</span>
  );
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const { t, locale } = useI18n();
  return (
    <div className="min-h-dvh">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-faint">
          {t("Last updated", "Última actualización")}: {LEGAL_UPDATED[locale]}
        </p>
        <nav className="mt-6 flex flex-wrap gap-3 text-sm">
          <Link href="/terms" className="text-muted hover:text-text">{t("Terms of Service", "Términos de servicio")}</Link>
          <span className="text-faint">·</span>
          <Link href="/privacy" className="text-muted hover:text-text">{t("Privacy Policy", "Aviso de privacidad")}</Link>
          <span className="text-faint">·</span>
          <Link href="/refunds" className="text-muted hover:text-text">{t("Refunds & Cancellation", "Reembolsos y cancelación")}</Link>
        </nav>
        <div className="legal mt-10 space-y-8 text-[15px] leading-relaxed text-muted">{children}</div>
      </main>
      <PublicFooter />
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-medium text-text">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
