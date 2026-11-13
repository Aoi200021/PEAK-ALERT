import { NextResponse } from "next/server";
import { z } from "zod";
import { L } from "@/lib/i18n";
import { handler, HttpError, readJson, requireUser } from "@/lib/api";

const subSchema = z.object({
  endpoint: z.string().url().max(1000).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export const POST = handler(async (req: Request) => {
  const { user, admin } = await requireUser();
  const body = subSchema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "INVALID_SUBSCRIPTION", L("Invalid push subscription.", "Suscripción push no válida."));
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: body.data.endpoint,
      p256dh: body.data.keys.p256dh,
      auth: body.data.keys.auth,
      user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
  return NextResponse.json({ ok: true });
});

export const DELETE = handler(async (req: Request) => {
  const { user, admin } = await requireUser();
  const body = z.object({ endpoint: z.string().max(1000) }).safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "INVALID_INPUT", L("Invalid data.", "Datos no válidos."));
  await admin.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", body.data.endpoint);
  return NextResponse.json({ ok: true });
});
