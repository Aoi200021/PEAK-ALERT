import { NextResponse } from "next/server";
import { z } from "zod";
import { handler, HttpError, readJson, requireUser } from "@/lib/api";

const schema = z.object({ ids: z.array(z.string().uuid()).max(200).optional() });

/** Mark alerts as read: specific ids, or all when ids is omitted. */
export const POST = handler(async (req: Request) => {
  const { user, admin } = await requireUser();
  const body = schema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "INVALID_INPUT", "Datos no válidos.");
  let q = admin.from("alert_events").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (body.data.ids) q = q.in("id", body.data.ids);
  const { error } = await q;
  if (error) throw error;
  return NextResponse.json({ ok: true });
});
