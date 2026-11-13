import { beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { handleStripeEvent, planForPrice, subscriptionInfo } from "./index";

process.env.STRIPE_PRICE_PRO = "price_pro";
process.env.STRIPE_PRICE_PREMIUM = "price_premium";

/** Minimal Supabase stand-in that records updates. */
function fakeAdmin() {
  const updates: { table: string; values: Record<string, unknown>; filters: [string, unknown][] }[] = [];
  const builder = (table: string, values: Record<string, unknown>) => {
    const filters: [string, unknown][] = [];
    const b = {
      eq(c: string, v: unknown) { filters.push([c, v]); return b; },
      is(c: string, v: unknown) { filters.push([c, v]); return b; },
      select() { updates.push({ table, values, filters }); return Promise.resolve({ data: [{ id: "u1" }], error: null }); },
      then(res: (v: unknown) => void) { updates.push({ table, values, filters }); res({ data: null, error: null }); },
    };
    return b;
  };
  return { updates, admin: { from: (table: string) => ({ update: (values: Record<string, unknown>) => builder(table, values) }) } };
}

const sub = (status: string, price: string) =>
  ({ id: "sub_1", customer: "cus_1", status, items: { data: [{ price: { id: price }, current_period_end: 1_800_000_000 }] } }) as unknown as Stripe.Subscription;

describe("stripe billing", () => {
  let f: ReturnType<typeof fakeAdmin>;
  beforeEach(() => (f = fakeAdmin()));

  it("maps prices to plans", () => {
    expect(planForPrice("price_pro")).toBe("pro");
    expect(planForPrice("price_premium")).toBe("premium");
    expect(planForPrice("price_other")).toBe("free");
  });

  it("reads the period end from the subscription item", () => {
    expect(subscriptionInfo(sub("active", "price_pro")).currentPeriodEnd?.toISOString()).toBe("2027-01-15T08:00:00.000Z");
  });

  it("upgrades on active subscription and downgrades on cancellation", async () => {
    const stripe = {} as Stripe;
    const ev = (type: string, status: string) => ({ type, data: { object: sub(status, "price_premium") } }) as unknown as Stripe.Event;
    expect(await handleStripeEvent(f.admin as never, stripe, ev("customer.subscription.updated", "active"))).toMatchObject({ plan: "premium" });
    expect(await handleStripeEvent(f.admin as never, stripe, ev("customer.subscription.deleted", "canceled"))).toMatchObject({ plan: "free" });
    expect(f.updates[0].filters).toContainEqual(["stripe_customer_id", "cus_1"]);
  });

  it("verifies webhook signatures (rejects tampered payloads)", async () => {
    const s = new Stripe("sk_test_dummy");
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "customer.subscription.updated", data: { object: {} } });
    const header = s.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" });
    expect((await s.webhooks.constructEventAsync(payload, header, "whsec_test")).id).toBe("evt_1");
    await expect(s.webhooks.constructEventAsync(payload.replace("evt_1", "evt_2"), header, "whsec_test")).rejects.toThrow();
  });
});
