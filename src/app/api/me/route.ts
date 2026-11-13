import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/api";
import { webPushConfigured } from "@/lib/notifications/webpush";
import { billingEnabled } from "@/lib/billing";

export const GET = handler(async () => {
  const { user, plan, admin } = await requireUser();
  const [{ count: tokens }, { count: rules }, { count: pushDevices }] = await Promise.all([
    admin.from("watchlist").select("token_id", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("alert_rules").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    admin.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  return NextResponse.json({
    email: user.email,
    plan,
    usage: { tokens: tokens ?? 0, rules: rules ?? 0, pushDevices: pushDevices ?? 0 },
    pushConfigured: webPushConfigured(),
    billingEnabled: billingEnabled(),
  });
});
