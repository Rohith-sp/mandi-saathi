import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-slate-900 text-white px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-yellow-500 font-bold text-lg">MS</span>
            <span className="font-semibold text-lg tracking-tight">Mandi Saathi</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/requests"
              className="px-3 py-2 text-sm font-medium rounded hover:bg-slate-800 transition"
            >
              Requests
            </a>
            <a
              href="/pools"
              className="px-3 py-2 text-sm font-medium rounded hover:bg-slate-800 transition"
            >
              Pools
            </a>
            <a
              href="/map"
              className="px-3 py-2 text-sm font-medium rounded hover:bg-slate-800 transition"
            >
              Map
            </a>
            <a
              href="/prices"
              className="px-3 py-2 text-sm font-medium rounded hover:bg-slate-800 transition"
            >
              Prices
            </a>
            <a
              href="/logout"
              className="px-3 py-2 text-sm font-medium text-red-200 rounded hover:bg-red-500/10 hover:text-red-400 transition"
            >
              Logout
            </a>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}
