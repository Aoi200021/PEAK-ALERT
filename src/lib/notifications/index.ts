import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWebPush, webPushConfigured } from "./webpush";

export interface NotificationPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  /** "high" for Premium priority alerts and critical signals. */
  urgency?: "normal" | "high";
}

/**
 * A delivery channel. Web Push is implemented. Email / Telegram can be added by
 * implementing this interface and registering it in CHANNELS — nothing else changes.
 */
export interface NotificationChannel {
  id: string;
  enabled(): boolean;
  send(admin: SupabaseClient, userId: string, payload: NotificationPayload): Promise<{ delivered: number; error?: string }>;
}

const webPushChannel: NotificationChannel = {
  id: "webpush",
  enabled: webPushConfigured,
  async send(admin, userId, payload) {
    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (error) return { delivered: 0, error: error.message };
    let delivered = 0;
    const errors: string[] = [];
    for (const s of subs ?? []) {
      const r = await sendWebPush(s, payload);
      if (r.ok) delivered++;
      else if (r.gone) await admin.from("push_subscriptions").delete().eq("id", s.id);
      else if (r.error) errors.push(r.error);
    }
    return { delivered, error: errors[0] };
  },
};

export const CHANNELS: NotificationChannel[] = [webPushChannel];

/** Deliver to every enabled channel. In-app notifications come from alert_events itself. */
export async function notifyUser(admin: SupabaseClient, userId: string, payload: NotificationPayload) {
  let delivered = 0;
  const errors: string[] = [];
  for (const ch of CHANNELS) {
    if (!ch.enabled()) continue;
    try {
      const r = await ch.send(admin, userId, payload);
      delivered += r.delivered;
      if (r.error) errors.push(`${ch.id}: ${r.error}`);
    } catch (e) {
      errors.push(`${ch.id}: ${e instanceof Error ? e.message : "error"}`);
    }
  }
  return { delivered, error: errors.length ? errors.join("; ") : null };
}
