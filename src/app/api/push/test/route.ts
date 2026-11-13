import { NextResponse } from "next/server";
import { L } from "@/lib/i18n";
import { handler, HttpError, requireUser } from "@/lib/api";
import { localeFromRequest } from "@/lib/i18n/server";
import { notifyUser } from "@/lib/notifications";
import { webPushConfigured } from "@/lib/notifications/webpush";

/** Sends a clearly-labelled TEST notification to the user's devices. */
export const POST = handler(async (req: Request) => {
  const { user, admin } = await requireUser();
  const es = localeFromRequest(req) === "es";
  if (!webPushConfigured()) throw new HttpError(503, "PUSH_NOT_CONFIGURED", L("VAPID keys are not configured on the server.", "Las claves VAPID no están configuradas en el servidor."));
  const r = await notifyUser(admin, user.id, {
    title: es ? "PeakAlert · Prueba" : "PeakAlert · Test",
    body: es ? "Notificación de prueba. Así recibirás tus alertas." : "Test notification. This is how your alerts will arrive.",
    url: "/settings",
    tag: "test",
  });
  return NextResponse.json({ delivered: r.delivered, error: r.error });
});
