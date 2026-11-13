import "server-only";
import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { createClient } from "./supabase/server";
import { createAdminClient } from "./supabase/admin";
import { getPlan, type PlanDefinition } from "./plans";
import { MarketApiError } from "./market/dexscreener";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function zodMessage(err: ZodError): string {
  return err.issues.map((i) => i.message).join(". ");
}

/** Authenticate the request and load the user's plan. Throws HttpError(401). */
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "UNAUTHENTICATED", "Inicia sesión para continuar.");
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", data.user.id)
    .maybeSingle();
  const plan: PlanDefinition = getPlan(profile?.plan);
  return { user: data.user, plan, admin, supabase };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Cuerpo de la petición no válido.");
  }
}

/** Wrap a route handler: consistent JSON errors, never leak internals. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json(
          { error: { code: err.code, message: err.message, ...err.extra } },
          { status: err.status },
        );
      }
      if (err instanceof MarketApiError) {
        return NextResponse.json(
          { error: { code: "MARKET_API", message: err.message } },
          { status: err.retryable ? 503 : 502 },
        );
      }
      console.error("[api]", err);
      return NextResponse.json(
        { error: { code: "INTERNAL", message: "Error interno. Inténtalo de nuevo." } },
        { status: 500 },
      );
    }
  };
}
