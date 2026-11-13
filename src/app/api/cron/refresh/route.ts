import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAllTracked } from "@/lib/market/refresh";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Background job: refresh every tracked token, evaluate alerts, advance Paper Exits.
 * Call it every minute (Supabase pg_cron, Vercel Cron on Pro, or any external scheduler)
 * with header `Authorization: Bearer $CRON_SECRET`.
 */
async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const started = Date.now();
  const admin = createAdminClient();
  try {
    const summary = await refreshAllTracked(admin);
    // Prune old snapshots roughly once an hour
    if (new Date().getMinutes() === 0) await admin.rpc("prune_snapshots", { keep_days: 8 });
    return NextResponse.json({ ok: true, ms: Date.now() - started, ...summary });
  } catch (e) {
    console.error("[cron] refresh failed", e);
    return NextResponse.json({ ok: false, error: "refresh failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
