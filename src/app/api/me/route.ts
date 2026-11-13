import { NextResponse } from "next/server";
import { handler, HttpError, readJson, requireUser } from "@/lib/api";
import { isLocale, L } from "@/lib/i18n";
import { localeFromRequest } from "@/lib/i18n/server";
import { webPushConfigured } from "@/lib/notifications/webpush";
import { billingEnabled } from "@/lib/billing";

export const GET = handler(async (req: Request) => {
  const { user, plan, admin, profileLocale } = await requireUser();
  // Keep the account language in sync with the language the user is browsing in (used for alerts/push).
  const locale = localeFromRequest(req);
  if (locale !== profileLocale) await admin.from("profiles").update({ locale }).eq("id", user.id);
  const { data: billing } = await admin
    .from("profiles")
    .select("stripe_customer_id, subscription_status, current_period_end")
    .eq("id", user.id)
    .maybeSingle();
  const [{ count: tokens }, { count: rules }, { count: pushDevices }] = await Promise.all([
    admin.from("watchlist").select("token_id", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("alert_rules").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  return NextResponse.json({
    email: user.email,
    plan,
    usage: { tokens: tokens ?? 0, rules: rules ?? 0, pushDevices: pushDevices ?? 0 },
    locale,
    pushConfigured: webPushConfigured(),
    billingEnabled: billingEnabled(),
    subscription: {
      hasCustomer: Boolean(billing?.stripe_customer_id),
      status: billing?.subscription_status ?? null,
      currentPeriodEnd: billing?.current_period_end ?? null,
    },
  });
});

/** Change the account language (alerts and push notifications use it). */
export const PATCH = handler(async (req: Request) => {
  const { user, admin } = await requireUser();
  const body = (await readJson(req)) as { locale?: unknown };
  if (!isLocale(body?.locale)) throw new HttpError(400, "INVALID_INPUT", L("Invalid language.", "Idioma no válido."));
  await admin.from("profiles").update({ locale: body.locale }).eq("id", user.id);
  return NextResponse.json({ ok: true, locale: body.locale });
});
