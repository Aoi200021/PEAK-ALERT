import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, HttpError, readJson, requireUser, zodMessage } from "@/lib/api";
import { ALERT_META, ALERT_TYPES, PARAM_SCHEMAS, POSITION_ALERT_TYPES } from "@/lib/alerts/types";
import { DEFAULT_COOLDOWN_MINUTES, planAllowsAlert, requiredPlanForAlert } from "@/lib/plans";
import { uuidSchema } from "@/lib/validation";

const MAX_RULES_PER_TOKEN = 10;

const createSchema = z.object({
  tokenId: uuidSchema,
  type: z.enum(ALERT_TYPES),
  params: z.unknown(),
  positionId: uuidSchema.optional(),
  cooldownMinutes: z.coerce.number().int().min(5).max(1440).optional(),
});

export const GET = handler(async () => {
  const { user, admin } = await requireUser();
  const { data, error } = await admin
    .from("alert_rules")
    .select("*, token:tokens(id, symbol, name, chain_id, image_url, price_usd, risk_score, risk_level), position:positions(id, entry_price, invested_usd, exit_price)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return NextResponse.json({ rules: data ?? [] });
});

export const POST = handler(async (req: Request) => {
  const { user, plan, admin } = await requireUser();
  const body = createSchema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "INVALID_INPUT", zodMessage(body.error));
  const { tokenId, type } = body.data;

  if (!planAllowsAlert(plan, type)) {
    throw new HttpError(
      403,
      "PLAN_FEATURE",
      `"${ALERT_META[type].label}" requiere el plan ${requiredPlanForAlert(type) === "pro" ? "Pro" : "Free"} o superior.`,
    );
  }
  const params = PARAM_SCHEMAS[type].safeParse(body.data.params);
  if (!params.success) throw new HttpError(400, "INVALID_PARAMS", zodMessage(params.error));

  let positionId: string | null = null;
  if (POSITION_ALERT_TYPES.includes(type)) {
    // Position-based rule: must point to one of the user's OPEN positions on this token.
    if (!body.data.positionId) throw new HttpError(400, "POSITION_REQUIRED", "Elige la posición que quieres proteger.");
    const { data: pos } = await admin
      .from("positions")
      .select("id, token_id, exit_price")
      .eq("id", body.data.positionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!pos || pos.token_id !== tokenId) throw new HttpError(404, "NOT_FOUND", "Posición no encontrada.");
    if (pos.exit_price != null) throw new HttpError(400, "POSITION_CLOSED", "La posición ya está cerrada.");
    positionId = pos.id;
  } else {
    const { data: watched } = await admin
      .from("watchlist")
      .select("token_id")
      .eq("user_id", user.id)
      .eq("token_id", tokenId)
      .maybeSingle();
    if (!watched) throw new HttpError(400, "NOT_WATCHING", "Primero agrega el token a tu lista.");
  }

  const { count } = await admin
    .from("alert_rules")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("token_id", tokenId);
  if ((count ?? 0) >= MAX_RULES_PER_TOKEN)
    throw new HttpError(400, "TOO_MANY_RULES", `Máximo ${MAX_RULES_PER_TOKEN} alertas por token.`);

  const cooldown = plan.customCooldown
    ? (body.data.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES)
    : DEFAULT_COOLDOWN_MINUTES;

  const { data, error } = await admin
    .from("alert_rules")
    .insert({ user_id: user.id, token_id: tokenId, type, params: params.data, cooldown_minutes: cooldown, position_id: positionId })
    .select("*")
    .single();
  if (error) throw error;
  return NextResponse.json({ rule: data }, { status: 201 });
});
