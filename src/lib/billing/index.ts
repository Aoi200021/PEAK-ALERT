import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanId } from "../plans";

/**
 * Billing with Stripe Checkout + Customer Portal + webhooks.
 *
 * It is ONLY active when every variable below is configured. Without them the
 * pricing page shows "Pagos aún no disponibles" and no charge can happen.
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_PREMIUM
 * The amount charged is whatever the Stripe Price says — create them as
 * $5/month (Pro) and $10/month (Premium) to match the pricing page.
 */
export function billingEnabled(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_PRO &&
      process.env.STRIPE_PRICE_PREMIUM,
  );
}

let client: Stripe | null = null;
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY no configurada");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export function priceForPlan(plan: "pro" | "premium"): string {
  const id = plan === "pro" ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_PREMIUM;
  if (!id) throw new Error(`Falta el Price ID de Stripe para ${plan}`);
  return id;
}

/** Stripe Price ID → plan. Prices are configured in Stripe, not hardcoded here. */
export function planForPrice(priceId: string | null | undefined): PlanId {
  if (priceId && priceId === process.env.STRIPE_PRICE_PREMIUM) return "premium";
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return "free";
}

const ACTIVE = new Set(["active", "trialing", "past_due"]);

export interface SubscriptionInfo {
  customerId: string;
  subscriptionId: string;
  status: string;
  priceId: string | null;
  currentPeriodEnd: Date | null;
}

export function subscriptionInfo(sub: Stripe.Subscription): SubscriptionInfo {
  const item = sub.items?.data?.[0];
  const end = item?.current_period_end ?? null;
  return {
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    subscriptionId: sub.id,
    status: sub.status,
    priceId: item?.price?.id ?? null,
    currentPeriodEnd: end ? new Date(end * 1000) : null,
  };
}

/** Sync a subscription into profiles.plan. Called from the webhook only. */
export async function applySubscription(admin: SupabaseClient, sub: SubscriptionInfo) {
  const plan: PlanId = ACTIVE.has(sub.status) ? planForPrice(sub.priceId) : "free";
  const { data, error } = await admin
    .from("profiles")
    .update({
      plan,
      stripe_subscription_id: sub.subscriptionId,
      subscription_status: sub.status,
      current_period_end: sub.currentPeriodEnd?.toISOString() ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", sub.customerId)
    .select("id");
  if (error) throw error;
  return { plan, matched: data?.length ?? 0 };
}

/** Handle a verified Stripe event. Returns what happened (for logs/tests). */
export async function handleStripeEvent(admin: SupabaseClient, stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.user_id;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (userId && customerId) {
        // Link the customer to the user in case it wasn't stored yet.
        await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId).is("stripe_customer_id", null);
      }
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!subId) return { handled: false };
      const sub = await stripe.subscriptions.retrieve(subId);
      return { handled: true, ...(await applySubscription(admin, subscriptionInfo(sub))) };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      return { handled: true, ...(await applySubscription(admin, subscriptionInfo(sub))) };
    }
    default:
      return { handled: false };
  }
}
