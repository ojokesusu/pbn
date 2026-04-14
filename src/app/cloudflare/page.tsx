"use client"

import { useEffect, useState, useCallback } from "react"
import { Cloud, CheckCircle2, AlertCircle, Loader2, RefreshCw, Globe, Zap } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { useConfirm } from "@/components/ui/confirm-modal"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface CheckResult {
  token: { valid: boolean; status: string }
  cloudflare: { totalZones: number }
  domains: {
    total: number
    withServer: number
    onCloudflare: number
    notOnCloudflare: number
    pending: number
    missingExamples: string[]
    pendingExamples: string[]
  }
}

interface SyncResult {
  domain: string
  url: string
  status: "success" | "failed" | "skipped"
  message: string
}

interface SyncResponse {
  message: string
  summary: { total: number; success: number; failed: number; skipped: number }
  results: SyncResult[]
}

export default function CloudflarePage() {
  const confirm = useConfirm()
  const [checking, setChecking] = useState(false)
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResponse | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const handleCheck = useCallback(async () => {
    setChecking(true)
    setError(null)
    try {
      const res = await fetch("/api/cloudflare/check")
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Check gagal")
        return
      }
      setCheck(data)
    } catch {
      setError("Gagal terhubung ke server")
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    handleCheck()
  }, [handleCheck])

  async function handleSyncAll() {
    if (!check) return
    const ok = await confirm({ message: `Sync DNS untuk ${check.domains.onCloudflare} domain ke Cloudflare? Ini akan set A record @ → server IP dan CNAME www → @` })
    if (!ok) return

    setSyncing(true)
    setSyncResult(null)
    setError(null)

    // Sync in batches of 25 to avoid timeout
    const batchSize = 25
    const total = check.domains.total
    setProgress({ current: 0, total })

    const allResults: SyncResult[] = []
    const summary = { total: 0, success: 0, failed: 0, skipped: 0 }

    try {
      for (let offset = 0; offset < total; offset += batchSize) {
        const res = await fetch("/api/cloudflare/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true, limit: batchSize, offset }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Sync gagal")
          break
        }
        allResults.push(...data.results)
        summary.total += data.summary.total
        summary.success += data.summary.success
        summary.failed += data.summary.failed
        summary.skipped += data.summary.skipped
        setProgress({ current: Math.min(offset + batchSize, total), total })
      }

      setSyncResult({
        message: `Sync selesai: ${summary.success} success, ${summary.failed} failed, ${summary.skipped} skipped`,
        summary,
        results: allResults,
      })
      // Refresh check
      handleCheck()
    } catch {
      setError("Sync gagal")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <SidebarInset>
      <AppHeader title="Cloudflare DNS" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl" style={{ background: "rgba(245,158,11,0.1)" }}>
              <Cloud className="size-5" style={{ color: "#f59e0b" }} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Cloudflare DNS Sync</h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Sync DNS records semua domain ke server IP otomatis</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-lg"
            style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
            onClick={handleCheck}
            disabled={checking}
          >
            {checking ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
            Refresh
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border p-4 mb-6 flex items-start gap-3" style={{ background: "rgba(239,68,68,0.1)", borderColor: "#fecaca" }}>
            <AlertCircle className="size-5 mt-0.5 text-red-500 shrink-0" />
            <div>
              <p className="font-medium text-red-700">Error</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {checking && !check && (
          <div className="rounded-xl border p-12 text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <Loader2 className="size-8 mx-auto animate-spin mb-3" style={{ color: "#0ea5e9" }} />
            <p style={{ color: "var(--muted-foreground)" }}>Mengecek Cloudflare...</p>
          </div>
        )}

        {/* Check Results */}
        {check && (
          <>
            {/* Status Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle2 className="size-5 text-emerald-500" />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>API Token</p>
                </div>
                <p className="text-lg font-bold text-emerald-600">Active</p>
              </div>

              <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <Cloud className="size-5" style={{ color: "#f59e0b" }} />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Total Zones</p>
                </div>
                <p className="text-lg font-bold" style={{ color: "var(--foreground)" }}>{check.cloudflare.totalZones.toLocaleString()}</p>
              </div>

              <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <Globe className="size-5" style={{ color: "#0ea5e9" }} />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Domain Kita</p>
                </div>
                <p className="text-lg font-bold" style={{ color: "var(--foreground)" }}>{check.domains.total}</p>
              </div>

              <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="size-5 text-emerald-500" />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Siap Sync</p>
                </div>
                <p className="text-lg font-bold text-emerald-600">{check.domains.onCloudflare}</p>
              </div>
            </div>

            {/* Status Detail */}
            <div className="rounded-xl border p-6 mb-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="font-semibold mb-4" style={{ color: "var(--foreground)" }}>Status Domain</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: "rgba(16,185,129,0.1)" }}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-700">Aktif di Cloudflare</span>
                  </div>
                  <Badge className="bg-emerald-600 text-white">{check.domains.onCloudflare}</Badge>
                </div>

                {check.domains.pending > 0 && (
                  <div className="p-3 rounded-lg" style={{ background: "rgba(245,158,11,0.1)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="size-4 text-amber-600" />
                        <span className="text-sm font-medium text-amber-700">Pending verifikasi</span>
                      </div>
                      <Badge className="bg-amber-600 text-white">{check.domains.pending}</Badge>
                    </div>
                    {check.domains.pendingExamples.length > 0 && (
                      <p className="text-xs text-amber-600 ml-6">
                        Contoh: {check.domains.pendingExamples.join(", ")}
                      </p>
                    )}
                  </div>
                )}

                {check.domains.notOnCloudflare > 0 && (
                  <div className="p-3 rounded-lg" style={{ background: "rgba(239,68,68,0.1)" }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="size-4 text-red-600" />
                        <span className="text-sm font-medium text-red-700">Belum di Cloudflare</span>
                      </div>
                      <Badge className="bg-red-600 text-white">{check.domains.notOnCloudflare}</Badge>
                    </div>
                    {check.domains.missingExamples.length > 0 && (
                      <p className="text-xs text-red-600 ml-6">
                        Contoh: {check.domains.missingExamples.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Sync Action */}
            <div className="rounded-xl border p-6 mb-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>Sync DNS Records</h3>
              <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
                Akan men-set <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: "var(--muted)" }}>A @ → server IP</code> dan <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: "var(--muted)" }}>CNAME www → @</code> untuk semua domain.
              </p>

              {syncing && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" style={{ color: "var(--secondary-foreground)" }}>
                      Syncing... {progress.current} / {progress.total}
                    </span>
                    <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {Math.round((progress.current / progress.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(progress.current / progress.total) * 100}%`,
                        background: "linear-gradient(90deg, #0ea5e9, #0284c7)",
                      }}
                    />
                  </div>
                </div>
              )}

              <Button
                className="bg-[#f59e0b] hover:bg-[#d97706] text-white rounded-lg shadow-lg shadow-[#f59e0b]/20"
                onClick={handleSyncAll}
                disabled={syncing || check.domains.total === 0}
              >
                {syncing ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Cloud className="size-4 mr-1" />}
                {syncing ? "Syncing..." : `Sync Semua DNS (${check.domains.total})`}
              </Button>
            </div>

            {/* Sync Results */}
            {syncResult && (
              <div className="rounded-xl border p-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <h3 className="font-semibold mb-4" style={{ color: "var(--foreground)" }}>Hasil Sync</h3>

                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg p-3 text-center" style={{ background: "var(--background)" }}>
                    <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{syncResult.summary.total}</p>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Total</p>
                  </div>
                  <div className="rounded-lg p-3 text-center" style={{ background: "rgba(16,185,129,0.1)" }}>
                    <p className="text-2xl font-bold text-emerald-600">{syncResult.summary.success}</p>
                    <p className="text-xs text-emerald-500">Success</p>
                  </div>
                  <div className="rounded-lg p-3 text-center" style={{ background: "rgba(239,68,68,0.1)" }}>
                    <p className="text-2xl font-bold text-red-600">{syncResult.summary.failed}</p>
                    <p className="text-xs text-red-500">Failed</p>
                  </div>
                  <div className="rounded-lg p-3 text-center" style={{ background: "rgba(245,158,11,0.1)" }}>
                    <p className="text-2xl font-bold text-amber-600">{syncResult.summary.skipped}</p>
                    <p className="text-xs text-amber-500">Skipped</p>
                  </div>
                </div>

                {/* Failed list */}
                {syncResult.summary.failed > 0 && (
                  <div className="rounded-lg border p-4 max-h-64 overflow-y-auto" style={{ background: "rgba(239,68,68,0.1)", borderColor: "#fecaca" }}>
                    <p className="font-medium text-red-700 mb-2 text-sm">Gagal:</p>
                    {syncResult.results.filter(r => r.status === "failed").map((r, i) => (
                      <p key={i} className="text-xs text-red-600 mb-1">
                        <strong>{r.domain}</strong>: {r.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </SidebarInset>
  )
}
