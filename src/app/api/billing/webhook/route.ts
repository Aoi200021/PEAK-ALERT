import { NextResponse } from "next/server";
import { billingEnabled, getStripe, handleStripeEvent } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe webhook. Configure in Stripe → Developers → Webhooks with:
 *   checkout.session.completed, customer.subscription.created|updated|deleted
 * The signature is ALWAYS verified; unsigned payloads are rejected.
 */
export async function POST(req: Request) {
  if (!billingEnabled()) return NextResponse.json({ error: "billing not configured" }, { status: 501 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const stripe = getStripe();
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(createAdminClient(), stripe, event);
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    console.error("[stripe] webhook failed", e);
    // 500 → Stripe retries the delivery later.
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
