/**
 * Environment access. Public values (NEXT_PUBLIC_*) are inlined into the browser bundle;
 * everything else must only be read on the server.
 */
export function publicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Supabase now issues "publishable" keys; the legacy "anon" key also works.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, key, configured: Boolean(url && key) };
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Revisa .env.local (ver README).`);
  return v;
}
