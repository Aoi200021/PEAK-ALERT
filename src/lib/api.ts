import "server-only";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { getPlan, type PlanDefinition } from "./plans";
import { MarketApiError } from "./market/dexscreener";
import { L, pick, pickMsg, type L10n, type Locale } from "./i18n";
import { localeFromRequest } from "./i18n/server";

export class HttpError extends Error {
  public l10n: L10n | string;
  constructor(
    public status: number,
    public code: string,
    message: L10n | string,
    public extra?: Record<string, unknown>,
  ) {
    super(typeof message === "string" ? message : message.en);
    this.l10n = message;
  }
}

/** Joins zod issues; bilingual messages (built with `msg()`) are resolved by the handler. */
export function zodMessage(err: ZodError): string {
  return err.issues.map((i) => i.message).join(". ");
}

/** Authenticate the request and load the user's plan. Throws HttpError(401). */
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "UNAUTHENTICATED", L("Sign in to continue.", "Inicia sesión para continuar."));
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("plan, locale")
    .eq("id", data.user.id)
    .maybeSingle();
  const plan: PlanDefinition = getPlan(profile?.plan);
  return { user: data.user, plan, admin, supabase, profileLocale: (profile?.locale ?? "en") as Locale };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", L("Invalid request body.", "Cuerpo de la petición no válido."));
  }
}

/** Wrap a route handler: consistent JSON errors, never leak internals. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const locale = localeFromRequest(args[0] as Request | undefined);
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json(
          { error: { code: err.code, message: pickMsg(pick(err.l10n, locale), locale), ...err.extra } },
          { status: err.status },
        );
      }
      if (err instanceof MarketApiError) {
        return NextResponse.json(
          { error: { code: "MARKET_API", message: pickMsg(err.message, locale) } },
          { status: err.retryable ? 503 : 502 },
        );
      }
      console.error("[api]", err);
      return NextResponse.json(
        { error: { code: "INTERNAL", message: pick(L("Internal error. Please try again.", "Error interno. Inténtalo de nuevo."), locale) } },
        { status: 500 },
      );
    }
  };
}
