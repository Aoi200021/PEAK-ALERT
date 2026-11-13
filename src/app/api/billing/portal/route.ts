import { NextResponse } from "next/server";
import { L } from "@/lib/i18n";
import { handler, HttpError, requireUser } from "@/lib/api";
import { billingEnabled, getStripe } from "@/lib/billing";

/** Stripe Customer Portal: change plan, update card, cancel. */
export const POST = handler(async (req: Request) => {
  const { user, admin } = await requireUser();
  if (!billingEnabled()) throw new HttpError(501, "BILLING_NOT_AVAILABLE", L("Payments aren't available yet.", "Los pagos todavía no están disponibles."));
  const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (!profile?.stripe_customer_id) throw new HttpError(400, "NO_CUSTOMER", L("You don't have a subscription.", "No tienes una suscripción."));
  const session = await getStripe().billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${new URL(req.url).origin}/settings`,
  });
  return NextResponse.json({ url: session.url });
});
