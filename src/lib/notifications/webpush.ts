import "server-only";
import { sendNotification, setVapidDetails } from "web-push";

let configured: boolean | null = null;

export function webPushConfigured(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) {
    configured = false;
    return false;
  }
  setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url: string; tag?: string },
): Promise<{ ok: boolean; gone?: boolean; error?: string }> {
  if (!webPushConfigured()) return { ok: false, error: "web push not configured" };
  try {
    await sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60, urgency: "high" },
    );
    return { ok: true };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404/410: the browser unsubscribed → delete the subscription.
    if (status === 404 || status === 410) return { ok: false, gone: true };
    return { ok: false, error: `push ${status ?? "error"}` };
  }
}
