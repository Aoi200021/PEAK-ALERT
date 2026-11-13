"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseEnv } from "../env";

export function createClient() {
  const { url, key } = publicSupabaseEnv();
  if (!url || !key) throw new Error("Supabase no está configurado (NEXT_PUBLIC_SUPABASE_URL / KEY).");
  return createBrowserClient(url, key);
}
