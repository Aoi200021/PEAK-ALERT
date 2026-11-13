import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanId } from "../plans";

/**
 * Billing — PREPARED, NOT IMPLEMENTED.
 *
 * What exists today:
 *   - profiles.plan / stripe_* columns in the database
 *   - plan limits enforced server-side (src/lib/plans.ts + DB trigger)
 *   - applySubscription(): maps a Stripe subscription to a plan and updates the profile
 *
 * What is missing to charge real money (see README → "Stripe"):
 *   1. `npm i stripe`, create Products/Prices in Stripe, set STRIPE_* env vars
 *   2. Implement createCheckoutSession() in /api/billing/checkout
 *   3. Verify webhook signatures in /api/billing/webhook and call applySubscription()
 *   4. Add a Customer Portal link in /settings
 *
 * Until then plans are changed manually with SQL (README → "Cambiar el plan de un usuario").
 */
export function billingEnabled(): boolean {
  return false;
}

/** Stripe Price ID → plan. Prices are configured in Stripe, not hardcoded here. */
export function planForPrice(priceId: string | null | undefined): PlanId {
  if (priceId && priceId === process.env.STRIPE_PRICE_PREMIUM) return "premium";
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return "free";
}

const ACTIVE = new Set(["active", "trialing"]);

/** To be called from the Stripe webhook (customer.subscription.created/updated/deleted). */
export async function applySubscription(
  admin: SupabaseClient,
  sub: {
    customerId: string;
    subscriptionId: string;
    status: string;
    priceId: string | null;
    currentPeriodEnd: Date | null;
  },
) {
  const plan: PlanId = ACTIVE.has(sub.status) ? planForPrice(sub.priceId) : "free";
  const { error } = await admin
    .from("profiles")
    .update({
      plan,
      stripe_subscription_id: sub.subscriptionId,
      subscription_status: sub.status,
      current_period_end: sub.currentPeriodEnd?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", sub.customerId);
  if (error) throw error;
  return plan;
}
