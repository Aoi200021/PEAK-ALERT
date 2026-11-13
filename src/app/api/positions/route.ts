import { NextResponse } from "next/server";
import { handler, HttpError, readJson, requireUser, zodMessage } from "@/lib/api";
import { createPositionSchema } from "@/lib/validation";

function requirePortfolio(plan: { portfolio: boolean }) {
  if (!plan.portfolio) throw new HttpError(403, "PLAN_FEATURE", "El portfolio tracker está disponible en Pro y Premium.");
}

export const GET = handler(async () => {
  const { user, plan, admin } = await requireUser();
  requirePortfolio(plan);
  const { data, error } = await admin
    .from("positions")
    .select("*, token:tokens(id, symbol, name, chain_id, image_url, price_usd, data_updated_at)")
    .eq("user_id", user.id)
    .order("entry_at", { ascending: false });
  if (error) throw error;
  return NextResponse.json({ positions: data ?? [], serverTime: new Date().toISOString() });
});

export const POST = handler(async (req: Request) => {
  const { user, plan, admin } = await requireUser();
  requirePortfolio(plan);
  const body = createPositionSchema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "INVALID_INPUT", zodMessage(body.error));
  const { tokenId, entryPrice, investedUsd, entryAt, notes } = body.data;

  const { data: token } = await admin.from("tokens").select("id").eq("id", tokenId).maybeSingle();
  if (!token) throw new HttpError(404, "NOT_FOUND", "Token no encontrado. Agrégalo primero a tu lista.");

  const { data, error } = await admin
    .from("positions")
    .insert({
      user_id: user.id,
      token_id: tokenId,
      entry_price: entryPrice,
      invested_usd: investedUsd,
      entry_at: (entryAt ?? new Date()).toISOString(),
      notes: notes || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return NextResponse.json({ position: data }, { status: 201 });
});
