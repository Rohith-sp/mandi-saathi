"use client"

import { useState } from "react"
import { createBrowserClient } from "@/lib/supabase/browser"
import { useRouter } from "next/navigation"

function describeAuthError(err: { message: string; status?: number }): string {
  const msg = err.message.toLowerCase()
  if (err.status === 429 || msg.includes("rate limit")) {
    return "Supabase's built-in email service is rate limited (about 2 per hour). Use password sign-in, or wait and retry."
  }
  if (msg.includes("invalid login credentials")) {
    return "Wrong email or password."
  }
  if (msg.includes("email not confirmed")) {
    return "This account's email is not confirmed. Confirm it in Supabase → Authentication → Users."
  }
  if (msg.includes("signups not allowed") || msg.includes("signup")) {
    return "Sign-ups are disabled for this project. Ask the FPO admin to create the account."
  }
  return err.message
}

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<"magic" | "password">("magic")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const supabase = createBrowserClient()

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/requests` },
    })

    setLoading(false)

    if (err) {
      setError(describeAuthError(err))
      return
    }

    setSent(true)
  }

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (err) {
      setLoading(false)
      setError(describeAuthError(err))
      return
    }

    router.push("/requests")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow border border-gray-200">
        <div className="text-center mb-8">
          <span className="text-yellow-500 font-bold text-lg">MS</span>
          <h1 className="text-2xl font-bold text-slate-900">Mandi Saathi</h1>
          <p className="text-sm text-gray-600 mt-2">FPO Operator Dashboard</p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 p-4 rounded-lg">
              Login link sent to <span className="font-medium">{email}</span>.
              Open it in this browser to continue.
            </div>
            <button
              type="button"
              onClick={() => {
                setSent(false)
                setPassword("")
              }}
              className="w-full py-3 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition"
            >
              Back to login
            </button>
          </div>
        ) : (
          <>
            <div className="flex rounded-lg border border-slate-200 p-1 mb-6 text-sm">
              <button
                type="button"
                onClick={() => {
                  setMode("magic")
                  setError("")
                }}
                className={`flex-1 py-2 rounded-md font-medium transition ${
                  mode === "magic"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Email link
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("password")
                  setError("")
                }}
                className={`flex-1 py-2 rounded-md font-medium transition ${
                  mode === "password"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Password
              </button>
            </div>

            <form
              onSubmit={mode === "magic" ? handleMagicLink : handlePassword}
              className="space-y-4"
            >
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none"
                  placeholder="operator@fpo.example.in"
                />
              </div>

              {mode === "password" && (
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none"
                  />
                </div>
              )}

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
                {loading
                  ? "Signing in..."
                  : mode === "magic"
                    ? "Send login link"
                    : "Sign in"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm text-gray-600">
          An operator account is required. Ask your FPO admin to add your email.
        </p>
      </div>
    </div>
  )
}
