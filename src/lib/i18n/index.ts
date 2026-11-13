/**
 * Minimal bilingual i18n (English default, Spanish).
 * Strings live next to their usage as (en, es) pairs — simple to keep in sync with 2 languages.
 */
export type Locale = "en" | "es";
export const LOCALES: Locale[] = ["en", "es"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "pa_locale";

export interface L10n {
  en: string;
  es: string;
}

export const L = (en: string, es: string): L10n => ({ en, es });

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "es";
}

export function pick(v: L10n | string | null | undefined, locale: Locale): string {
  if (v == null) return "";
  return typeof v === "string" ? v : (v[locale] ?? v.en);
}

/** Cookie wins; otherwise the browser's first preferred language (es* → Spanish, anything else → English). */
export function resolveLocale(cookie?: string | null, acceptLanguage?: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("es") ? "es" : DEFAULT_LOCALE;
}

export const INTL_LOCALE: Record<Locale, string> = { en: "en-US", es: "es" };

/**
 * Bilingual message that can travel through APIs that only accept strings (e.g. zod issues).
 * Decode with `pickMsg`.
 */
const SEP = "␞";
export const msg = (en: string, es: string) => `${en}${SEP}${es}`;
export function pickMsg(s: string, locale: Locale): string {
  if (!s.includes(SEP)) return s;
  const [en, es] = s.split(SEP);
  return locale === "es" ? es : en;
}
