import { NextResponse } from "next/server";

/**
 * Stripe webhook — NOT IMPLEMENTED. When enabling Stripe:
 *   const event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature")!, process.env.STRIPE_WEBHOOK_SECRET!)
 *   on customer.subscription.* → applySubscription(createAdminClient(), {...})
 * Never trust an unsigned payload.
 */
export async function POST() {
  return NextResponse.json({ error: "billing not implemented" }, { status: 501 });
}
