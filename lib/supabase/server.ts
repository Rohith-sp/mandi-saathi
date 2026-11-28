import "server-only"

import { type SupabaseClient } from "@supabase/supabase-js"
import { createServerClient as createSsrServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
export { createServiceClient } from "./service"

/**
 * Supabase clients.
 *
 * - createServerClient(): anon key + user session via @supabase/ssr cookies.
 *   Use for dashboard data and operator-authenticated paths. RLS applies.
 * - createServiceClient(): SERVICE_ROLE_KEY, bypasses RLS. Server-only.
 *   Use ONLY for admin paths (e.g. /api/advise writes, ingestion). Never
 *   for dashboard data reads that should respect per-FPO RLS.
 */

export async function createServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies()

  return createSsrServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as Record<string, unknown>)
            }
          } catch {
            // In Server Components you can't set cookies; this is a no-op.
          }
        },
      },
    }
  )
}
