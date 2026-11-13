import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseEnv } from "../env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client: BYPASSES RLS. Server-only — never import from a client component.
 * Always scope queries by the authenticated user's id yourself.
 */
export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const { url } = publicSupabaseEnv();
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY) en el servidor.");
  }
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
