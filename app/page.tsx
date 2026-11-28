import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"

// The operator dashboard is the entry point. Send signed-in operators to
// their requests queue and everyone else to the magic-link login.
export default async function Home() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  redirect(user ? "/requests" : "/login")
}
