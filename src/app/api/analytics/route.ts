import { NextResponse } from "next/server";
import { L } from "@/lib/i18n";
import { handler, HttpError, requireUser } from "@/lib/api";
import { changeAfterAlertPct } from "@/lib/paper-exit";
import type { Checkpoints } from "@/lib/paper-exit";

/**
 * Premium: aggregated Paper Exit stats — did selling at alerts beat holding?
 * Only uses prices PeakAlert actually observed.
 */
export const GET = handler(async () => {
  const { user, plan, admin } = await requireUser();
  if (!plan.analytics) throw new HttpError(403, "PLAN_FEATURE", L("Advanced analytics is a Premium feature.", "Las analíticas avanzadas son una función Premium."));

  const { data, error } = await admin
    .from("paper_exits")
    .select("alert_price, checkpoints, max_price_after, min_price_after, created_at, event:alert_events(type)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  type Bucket = { n: number; dropped: number; sumChange: number };
  const empty = (): Bucket => ({ n: 0, dropped: 0, sumChange: 0 });
  const byType: Record<string, Record<string, Bucket>> = {};
  const overall: Record<string, Bucket> = { "1h": empty(), "24h": empty(), "7d": empty() };
  let maxUpsideSum = 0;
  let maxUpsideN = 0;

  for (const pe of data ?? []) {
    const ev = Array.isArray(pe.event) ? pe.event[0] : pe.event;
    const type = (ev as { type?: string } | null)?.type ?? "unknown";
    byType[type] ??= { "1h": empty(), "24h": empty(), "7d": empty() };
    const cps = (pe.checkpoints ?? {}) as Checkpoints;
    for (const key of ["1h", "24h", "7d"] as const) {
      const cp = cps[key];
      if (!cp) continue;
      const ch = changeAfterAlertPct(Number(pe.alert_price), cp.price);
      if (ch == null) continue;
      for (const b of [overall[key], byType[type][key]]) {
        b.n++;
        b.sumChange += ch;
        if (ch < 0) b.dropped++;
      }
    }
    const up = changeAfterAlertPct(Number(pe.alert_price), pe.max_price_after == null ? null : Number(pe.max_price_after));
    if (up != null) {
      maxUpsideSum += up;
      maxUpsideN++;
    }
  }

  const fmt = (b: Bucket) => ({
    samples: b.n,
    hitRate: b.n ? (b.dropped / b.n) * 100 : null, // % of alerts after which price was lower
    avgChangePct: b.n ? b.sumChange / b.n : null,
  });

  return NextResponse.json({
    totalAlerts: data?.length ?? 0,
    overall: Object.fromEntries(Object.entries(overall).map(([k, v]) => [k, fmt(v)])),
    byType: Object.fromEntries(
      Object.entries(byType).map(([t, v]) => [t, Object.fromEntries(Object.entries(v).map(([k, b]) => [k, fmt(b)]))]),
    ),
    avgMaxUpsideAfterPct: maxUpsideN ? maxUpsideSum / maxUpsideN : null,
  });
});
