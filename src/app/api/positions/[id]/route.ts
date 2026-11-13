import { NextResponse } from "next/server";
import { handler, HttpError, readJson, requireUser, zodMessage } from "@/lib/api";
import { updatePositionSchema, uuidSchema } from "@/lib/validation";

export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/positions/[id]">) => {
  const { user, plan, admin } = await requireUser();
  if (!plan.portfolio) throw new HttpError(403, "PLAN_FEATURE", "El portfolio tracker está disponible en Pro y Premium.");
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "INVALID_ID", "ID no válido.");
  const body = updatePositionSchema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "INVALID_INPUT", zodMessage(body.error));
  const b = body.data;

  const { data: pos } = await admin.from("positions").select("entry_at").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!pos) throw new HttpError(404, "NOT_FOUND", "Posición no encontrada.");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.entryPrice !== undefined) patch.entry_price = b.entryPrice;
  if (b.investedUsd !== undefined) patch.invested_usd = b.investedUsd;
  if (b.entryAt !== undefined) patch.entry_at = b.entryAt.toISOString();
  if (b.notes !== undefined) patch.notes = b.notes || null;
  if (b.exitPrice === null) {
    patch.exit_price = null;
    patch.exit_at = null;
  } else if (b.exitPrice !== undefined) {
    const exitAt = b.exitAt ?? new Date();
    const entryAt = new Date((patch.entry_at as string) ?? pos.entry_at);
    if (exitAt < entryAt) throw new HttpError(400, "INVALID_INPUT", "La fecha de venta no puede ser anterior a la de compra.");
    patch.exit_price = b.exitPrice;
    patch.exit_at = exitAt.toISOString();
  }

  const { data, error } = await admin.from("positions").update(patch).eq("id", id).eq("user_id", user.id).select("*").single();
  if (error) throw error;
  return NextResponse.json({ position: data });
});

export const DELETE = handler(async (_req: Request, ctx: RouteContext<"/api/positions/[id]">) => {
  const { user, admin } = await requireUser();
  const { id } = await ctx.params;
  if (!uuidSchema.safeParse(id).success) throw new HttpError(400, "INVALID_ID", "ID no válido.");
  const { error } = await admin.from("positions").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
