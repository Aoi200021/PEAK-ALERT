import "server-only";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./index";

/** Locale for the current request (Server Components / Route Handlers). */
export async function getLocale(): Promise<Locale> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return resolveLocale(c.get(LOCALE_COOKIE)?.value, h.get("accept-language"));
}

/** Locale from a raw Request (no async context needed). */
export function localeFromRequest(req: Request | undefined): Locale {
  if (!req || typeof req.headers?.get !== "function") return "en";
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`));
  return resolveLocale(m?.[1], req.headers.get("accept-language"));
}
