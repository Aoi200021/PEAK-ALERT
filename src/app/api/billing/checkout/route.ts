import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, HttpError, readJson, requireUser } from "@/lib/api";
import { billingEnabled, getStripe, priceForPlan } from "@/lib/billing";

const schema = z.object({ plan: z.enum(["pro", "premium"]) });

/** Creates a Stripe Checkout session. 501 when Stripe isn't configured — no fake checkout. */
export const POST = handler(async (req: Request) => {
  const { user, plan: current, admin } = await requireUser();
  if (!billingEnabled()) throw new HttpError(501, "BILLING_NOT_AVAILABLE", "Los pagos todavía no están disponibles.");
  const body = schema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "INVALID_INPUT", "Plan no válido.");
  if (current.id === body.data.plan) throw new HttpError(400, "SAME_PLAN", "Ya tienes este plan.");

  const stripe = getStripe();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id, subscription_status")
    .eq("id", user.id)
    .single();

  // Already subscribed → change plan in the Customer Portal (avoids double subscriptions).
  if (profile?.stripe_subscription_id && ["active", "trialing", "past_due"].includes(profile.subscription_status ?? "")) {
    throw new HttpError(409, "HAS_SUBSCRIPTION", "Ya tienes una suscripción. Cambia de plan desde «Gestionar suscripción».");
  }

  let customerId = profile?.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
    customerId = customer.id;
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const origin = new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    metadata: { user_id: user.id },
    line_items: [{ price: priceForPlan(body.data.plan), quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/settings?billing=success`,
    cancel_url: `${origin}/pricing?billing=cancelled`,
  });
  return NextResponse.json({ url: session.url });
});
