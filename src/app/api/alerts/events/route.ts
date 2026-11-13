import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/api";

/** Alert history (with Paper Exit). Free plan: last 24 h only. */
export const GET = handler(async (req: Request) => {
  const { user, plan, admin } = await requireUser();
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  const before = url.searchParams.get("before");
  const unreadOnly = url.searchParams.get("unread") === "1";

  let q = admin
    .from("alert_events")
    .select(
      "id, type, title, message, price_usd, market_cap, metrics, severity, explanation, created_at, read_at, notified_at, notify_error, rule_id, token:tokens(id, symbol, name, chain_id, image_url, price_usd, risk_score, risk_level), paper:paper_exits(alert_price, quantity, entry_price, checkpoints, max_price_after, min_price_after, last_price, last_checked_at, closed, position_id)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (plan.historyHours != null) {
    q = q.gte("created_at", new Date(Date.now() - plan.historyHours * 3600_000).toISOString());
  }
  if (before && !Number.isNaN(Date.parse(before))) q = q.lt("created_at", before);
  if (unreadOnly) q = q.is("read_at", null);

  const { data, error } = await q;
  if (error) throw error;

  const { count: unread } = await admin
    .from("alert_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  return NextResponse.json({
    events: (data ?? []).map((e) => ({ ...e, paper: Array.isArray(e.paper) ? (e.paper[0] ?? null) : e.paper })),
    unread: unread ?? 0,
    historyHours: plan.historyHours,
  });
});
