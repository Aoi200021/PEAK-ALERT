import { NextResponse } from "next/server";
import { z } from "zod";
import { L } from "@/lib/i18n";
import { handler, HttpError, readJson, requireUser, zodMessage } from "@/lib/api";
import { PARAM_SCHEMAS, type AlertType } from "@/lib/alerts/types";
import { uuidSchema } from "@/lib/validation";

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  params: z.unknown().optional(),
  cooldownMinutes: z.coerce.number().int().min(5).max(1440).optional(),
});

async function loadRule(admin: Awaited<ReturnType<typeof requireUser>>["admin"], userId: string, id: string) {
  if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "INVALID_ID", L("Invalid ID.", "ID no válido."));
  const { data } = await admin.from("alert_rules").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!data) throw new HttpError(404, "NOT_FOUND", L("Alert not found.", "Alerta no encontrada."));
  return data;
}

export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/alerts/rules/[id]">) => {
  const { user, plan, admin } = await requireUser();
  const { id } = await ctx.params;
  const rule = await loadRule(admin, user.id, id);
  const body = patchSchema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "INVALID_INPUT", zodMessage(body.error));

  const patch: Record<string, unknown> = { version: rule.version + 1 };
  if (body.data.enabled !== undefined) patch.enabled = body.data.enabled;
  if (body.data.params !== undefined) {
    const p = PARAM_SCHEMAS[rule.type as AlertType].safeParse(body.data.params);
    if (!p.success) throw new HttpError(400, "INVALID_PARAMS", zodMessage(p.error));
    patch.params = p.data;
    // New thresholds → start a fresh cycle so the change takes effect cleanly.
    patch.armed = true;
    patch.state = {};
  }
  if (body.data.cooldownMinutes !== undefined) {
    if (!plan.customCooldown) throw new HttpError(403, "PLAN_FEATURE", L("Custom cooldown is a Premium feature.", "El cooldown personalizado es una función Premium."));
    patch.cooldown_minutes = body.data.cooldownMinutes;
  }
  const { data, error } = await admin.from("alert_rules").update(patch).eq("id", id).eq("user_id", user.id).select("*").single();
  if (error) throw error;
  return NextResponse.json({ rule: data });
});

export const DELETE = handler(async (_req: Request, ctx: RouteContext<"/api/alerts/rules/[id]">) => {
  const { user, admin } = await requireUser();
  const { id } = await ctx.params;
  await loadRule(admin, user.id, id);
  const { error } = await admin.from("alert_rules").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
