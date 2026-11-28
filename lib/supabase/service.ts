import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Service-role Supabase client (bypasses RLS).
 * Used by server-only API routes (via lib/supabase/server.ts) and CLI scripts.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
