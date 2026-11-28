"use client"

import { useState } from "react"
import { createBrowserClient } from "@/lib/supabase/browser"
import { useRouter } from "next/navigation"
import { maskPhone } from "@/lib/data/mask"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createBrowserClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
    })

    if (err) {
      setError("Unable to send magic link. Please try again.")
      setLoading(false)
      return
    }

    router.push("/requests")
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow border border-gray-200">
        <div className="text-center mb-8">
          <span className="text-yellow-500 font-bold text-lg">MS</span>
          <h1 className="text-2xl font-bold text-slate-900">Mandi Saathi</h1>
          <p className="text-sm text-gray-600 mt-2">FPO Operator Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none"
              placeholder="operator@fpo.example.in"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-slate-900 text-white font-medium rounded-lg disabled:bg-gray-400 hover:bg-slate-800 transition"
          >
            {loading ? "Sending magic link..." : "Send login link"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Check your email for the magic link to access the dashboard.
        </p>
      </div>
    </div>
  )
}
