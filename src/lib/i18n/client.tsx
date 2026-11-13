"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, pick, type L10n, type Locale } from "./index";

interface Ctx {
  locale: Locale;
  /** t("English", "Español") */
  t: (en: string, es: string) => string;
  /** Resolve a stored bilingual value. */
  p: (v: L10n | string | null | undefined) => string;
  setLocale: (l: Locale) => void;
}

const I18nContext = createContext<Ctx>({
  locale: "en",
  t: (en) => en,
  p: (v) => pick(v, "en"),
  setLocale: () => {},
});

export function I18nProvider({ locale: initial, children }: { locale: Locale; children: ReactNode }) {
  const [locale, setState] = useState<Locale>(initial);
  const router = useRouter();

  const setLocale = useCallback(
    (l: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
      setState(l);
      // Keep the account's language in sync for alerts/push (ignored when logged out).
      fetch("/api/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: l }) }).catch(() => {});
      router.refresh();
    },
    [router],
  );

  const value = useMemo<Ctx>(
    () => ({ locale, t: (en, es) => (locale === "es" ? es : en), p: (v) => pick(v, locale), setLocale }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
