import { NextResponse } from "next/server";
import { L } from "@/lib/i18n";
import { handler, HttpError, requireUser } from "@/lib/api";
import { refreshTokens } from "@/lib/market/refresh";
import { uuidSchema } from "@/lib/validation";

const RANGES = {
  "1h": { ms: 3600_000, bucket: 60 },
  "6h": { ms: 6 * 3600_000, bucket: 60 },
  "24h": { ms: 24 * 3600_000, bucket: 300 },
  "7d": { ms: 7 * 24 * 3600_000, bucket: 1800 },
} as const;

export const GET = handler(async (req: Request, ctx: RouteContext<"/api/tokens/[id]">) => {
  const { user, plan, admin } = await requireUser();
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "INVALID_ID", L("Invalid ID.", "ID no válido."));
  const rangeKey = (new URL(req.url).searchParams.get("range") ?? "24h") as keyof typeof RANGES;
  const range = RANGES[rangeKey] ?? RANGES["24h"];

  const { data: watched } = await admin
    .from("watchlist")
    .select("token_id")
    .eq("user_id", user.id)
    .eq("token_id", id)
    .maybeSingle();
  if (watched) {
    try {
      await refreshTokens(admin, [id]);
    } catch (e) {
      console.error("[token] refresh failed", e);
    }
  }

  const { data: token } = await admin.from("tokens").select("*").eq("id", id).maybeSingle();
  if (!token) throw new HttpError(404, "NOT_FOUND", L("Token not found.", "Token no encontrado."));

  const [history, rules, positions] = await Promise.all([
    admin.rpc("token_history", {
      p_token: id,
      p_since: new Date(Date.now() - range.ms).toISOString(),
      p_bucket_seconds: range.bucket,
    }),
    admin.from("alert_rules").select("*").eq("user_id", user.id).eq("token_id", id).order("created_at"),
    admin.from("positions").select("*").eq("user_id", user.id).eq("token_id", id).order("entry_at", { ascending: false }),
  ]);

  const { data: events } = await admin
    .from("alert_events")
    .select("id, title, created_at, price_usd, type, severity")
    .eq("user_id", user.id)
    .eq("token_id", id)
    .gte("created_at", new Date(Date.now() - range.ms).toISOString())
    .order("created_at");

  // Plan gating happens on the server, not only in the UI.
  if (!plan.riskBreakdown) token.risk_factors = null;
  const historyRows = ((history.data ?? []) as Record<string, unknown>[]).map((h) =>
    plan.signalHistory ? h : { ...h, risk_score: null },
  );

  return NextResponse.json({
    token,
    riskBreakdown: plan.riskBreakdown,
    signalHistory: plan.signalHistory,
    watched: Boolean(watched),
    history: historyRows,
    rules: rules.data ?? [],
    positions: positions.data ?? [],
    events: events ?? [],
    serverTime: new Date().toISOString(),
  });
});
