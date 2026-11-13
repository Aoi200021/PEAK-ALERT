import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/api";
import { notifyUser } from "@/lib/notifications";
import { webPushConfigured } from "@/lib/notifications/webpush";

/** Sends a clearly-labelled TEST notification to the user's devices. */
export const POST = handler(async () => {
  const { user, admin } = await requireUser();
  if (!webPushConfigured()) throw new HttpError(503, "PUSH_NOT_CONFIGURED", "Las claves VAPID no están configuradas en el servidor.");
  const r = await notifyUser(admin, user.id, {
    title: "PeakAlert · Prueba",
    body: "Notificación de prueba. Así recibirás tus alertas.",
    url: "/settings",
    tag: "test",
  });
  return NextResponse.json({ delivered: r.delivered, error: r.error });
});
