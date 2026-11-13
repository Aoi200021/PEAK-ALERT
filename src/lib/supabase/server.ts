import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicSupabaseEnv } from "../env";

/** User-scoped client (RLS applies). For Route Handlers and Server Components. */
export async function createClient() {
  // Read cookies first: marks the route as dynamic even when Supabase isn't configured yet.
  const cookieStore = await cookies();
  const { url, key } = publicSupabaseEnv();
  if (!url || !key) throw new Error("Supabase no está configurado (NEXT_PUBLIC_SUPABASE_URL / KEY).");
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there. proxy.ts refreshes them.
        }
      },
    },
  });
}
