"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LogIn, Lock, User, Loader2, Eye, EyeOff } from "lucide-react"

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const nextPath = params.get("next") || "/"

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Login gagal")
        setLoading(false)
        return
      }
      router.push(nextPath)
      router.refresh()
    } catch {
      setError("Koneksi bermasalah, coba lagi")
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(1200px 600px at 20% 10%, #ccfbf1 0%, transparent 60%), radial-gradient(1000px 500px at 80% 90%, #ecfccb 0%, transparent 60%), #f8fafc",
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-white shadow-xl"
        style={{ borderColor: "#e2e8f0" }}
      >
        <div className="p-8">
          <div className="mb-6 text-center">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: "linear-gradient(135deg, #14b8a6, #84cc16)",
                boxShadow: "0 10px 30px rgba(20,184,166,0.35)",
              }}
            >
              <Lock className="size-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#0f172a" }}>
              PBN Manager
            </h1>
            <p className="mt-1 text-sm" style={{ color: "#64748b" }}>
              Masuk untuk mengelola jaringan blog Anda
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4"
                  style={{ color: "#94a3b8" }}
                />
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4"
                  style={{ color: "#94a3b8" }}
                />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100 transition-colors"
                  style={{ color: "#64748b" }}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ background: "#fef2f2", borderColor: "#fecaca", color: "#b91c1c" }}
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-base font-semibold"
              style={{
                background: "linear-gradient(135deg, #14b8a6, #84cc16)",
                color: "white",
                border: "none",
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Sedang masuk...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 size-4" />
                  Masuk
                </>
              )}
            </Button>
          </form>

        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div />}>
      <LoginForm />
    </Suspense>
  )
}
