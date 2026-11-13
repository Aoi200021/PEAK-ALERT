import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/api";
import { uuidSchema } from "@/lib/validation";

/** Stop following a token. Also deletes this user's alert rules for it. Positions are kept. */
export const DELETE = handler(async (_req: Request, ctx: RouteContext<"/api/watchlist/[tokenId]">) => {
  const { user, admin } = await requireUser();
  const { tokenId } = await ctx.params;
  if (!uuidSchema.safeParse(tokenId).success) throw new HttpError(400, "INVALID_ID", "ID no válido.");
  await admin.from("alert_rules").delete().eq("user_id", user.id).eq("token_id", tokenId);
  const { error } = await admin.from("watchlist").delete().eq("user_id", user.id).eq("token_id", tokenId);
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
