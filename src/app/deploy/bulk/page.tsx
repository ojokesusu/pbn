"use client"

import { useEffect, useState, useCallback } from "react"
import { Rocket, CheckCircle2, XCircle, FileText, Loader2, RefreshCw, AlertCircle, Globe } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { useConfirm } from "@/components/ui/confirm-modal"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"

interface Stats {
  readyDomains: number
  alreadyDeployed: number
  neverDeployed: number
  totalArticles: number
}

interface DeployResult {
  domainId: string
  url: string
  status: "success" | "failed"
  filesDeployed: number
  message: string
  durationMs: number
}

export default function BulkDeployPage() {
  const confirm = useConfirm()
  const [stats, setStats] = useState<Stats | null>(null)
  const [deploying, setDeploying] = useState(false)
  const [results, setResults] = useState<DeployResult[]>([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [concurrency, setConcurrency] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ success: number; failed: number; totalFiles: number } | null>(null)
  const [onlyNeverDeployed, setOnlyNeverDeployed] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/deploy/bulk")
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  async function handleBulkDeploy() {
    if (!stats) return
    const count = onlyNeverDeployed ? stats.neverDeployed : stats.readyDomains
    if (count === 0) {
      alert("Tidak ada domain untuk di-deploy")
      return
    }
    const ok = await confirm({ message: `Deploy ${count} domain sekaligus via FTP?\n\nParalel: ${concurrency} domain sekaligus. Estimasi waktu: ${Math.ceil((count / concurrency) * 30)} detik.` })
    if (!ok) return

    setDeploying(true)
    setResults([])
    setSummary(null)
    setError(null)

    // Fetch the domain list we'll deploy
    let domainIds: string[] = []
    try {
      const listRes = await fetch("/api/domains")
      const domains = await listRes.json()
      domainIds = domains
        .filter((d: { server: { host: string } | null; _count: { articles: number }; lastDeployed: string | null }) =>
          d.server && d._count.articles > 0 && (!onlyNeverDeployed || !d.lastDeployed)
        )
        .map((d: { id: string }) => d.id)
    } catch {
      setError("Gagal fetch daftar domain")
      setDeploying(false)
      return
    }

    const batchSize = concurrency * 3 // process ~9 at a time per API call
    const total = domainIds.length
    setProgress({ current: 0, total })

    let totalSuccess = 0
    let totalFailed = 0
    let totalFiles = 0
    const allResults: DeployResult[] = []

    try {
      for (let i = 0; i < total; i += batchSize) {
        const batch = domainIds.slice(i, i + batchSize)
        const res = await fetch("/api/deploy/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domainIds: batch, concurrency }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Bulk deploy gagal")
          break
        }
        allResults.push(...data.results)
        totalSuccess += data.summary.success
        totalFailed += data.summary.failed
        totalFiles += data.summary.totalFiles
        setResults(allResults.slice(-100))
        setProgress({ current: Math.min(i + batchSize, total), total })
      }
      setSummary({ success: totalSuccess, failed: totalFailed, totalFiles })
      fetchStats()
    } catch (err) {
      setError(`Deploy gagal: ${String(err)}`)
    } finally {
      setDeploying(false)
    }
  }

  return (
    <SidebarInset>
      <AppHeader title="Bulk Deploy" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl" style={{ background: "rgba(14,165,233,0.1)" }}>
              <Rocket className="size-5" style={{ color: "#0ea5e9" }} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Bulk Deploy</h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Deploy semua domain ke cPanel server via FTP dalam 1 klik</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-lg"
            style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
            onClick={fetchStats}
          >
            <RefreshCw className="size-4 mr-1" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Globe className="size-4" style={{ color: "#0ea5e9" }} />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Deploy Ready</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{stats.readyDomains}</p>
            </div>

            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Sudah Deploy</p>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{stats.alreadyDeployed}</p>
            </div>

            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="size-4 text-amber-500" />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Belum Deploy</p>
              </div>
              <p className="text-2xl font-bold text-amber-600">{stats.neverDeployed}</p>
            </div>

            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="size-4" style={{ color: "#a855f7" }} />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Total Artikel</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "#a855f7" }}>{stats.totalArticles.toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* Settings */}
        <div className="rounded-xl border p-6 mb-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h3 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Pengaturan Deploy</h3>

          <div className="mb-4">
            <Label className="text-sm" style={{ color: "var(--secondary-foreground)" }}>Filter</Label>
            <div className="flex items-center gap-3 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={onlyNeverDeployed}
                  onChange={() => setOnlyNeverDeployed(true)}
                  disabled={deploying}
                />
                <span className="text-sm" style={{ color: "var(--secondary-foreground)" }}>Hanya yang belum pernah di-deploy ({stats?.neverDeployed || 0})</span>
              </label>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!onlyNeverDeployed}
                  onChange={() => setOnlyNeverDeployed(false)}
                  disabled={deploying}
                />
                <span className="text-sm" style={{ color: "var(--secondary-foreground)" }}>Semua domain yang punya artikel ({stats?.readyDomains || 0}) — akan re-deploy yang sudah ada</span>
              </label>
            </div>
          </div>

          <div className="mb-4">
            <Label className="text-sm" style={{ color: "var(--secondary-foreground)" }}>Paralel FTP connections</Label>
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range"
                min="1"
                max="5"
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value))}
                className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
                style={{ background: "var(--border)" }}
                disabled={deploying}
              />
              <span className="font-bold w-12 text-center" style={{ color: "#0ea5e9" }}>{concurrency}</span>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              Makin tinggi makin cepat tapi bisa overload server. Recommended: 3.
            </p>
          </div>

          <div className="rounded-lg p-3 text-xs mb-4" style={{ background: "rgba(245,158,11,0.15)", color: "#92400e" }}>
            <strong>⚠️ Peringatan:</strong> Deploy ini akan mengganti konten di cPanel server dengan site yang kita generate. Pastikan sudah backup jika perlu.
          </div>

          {deploying && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: "var(--secondary-foreground)" }}>
                  Deploying... {progress.current} / {progress.total} domain
                </span>
                <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                    background: "linear-gradient(90deg, #0ea5e9, #0284c7)",
                  }}
                />
              </div>
            </div>
          )}

          <Button
            className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20"
            onClick={handleBulkDeploy}
            disabled={deploying || !stats || (onlyNeverDeployed ? stats.neverDeployed === 0 : stats.readyDomains === 0)}
          >
            {deploying ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Rocket className="size-4 mr-1" />}
            {deploying ? "Deploying..." : `Deploy ${onlyNeverDeployed ? (stats?.neverDeployed || 0) : (stats?.readyDomains || 0)} Domain`}
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

        {/* Summary */}
        {summary && (
          <div className="rounded-xl border p-6 mb-6 shadow-sm" style={{ background: "rgba(16,185,129,0.1)", borderColor: "#bbf7d0" }}>
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 className="size-6 text-emerald-600" />
              <h3 className="text-lg font-bold text-emerald-700">Deploy Selesai!</h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg p-3 text-center bg-white">
                <p className="text-2xl font-bold text-emerald-600">{summary.success}</p>
                <p className="text-xs text-emerald-500">Deployed</p>
              </div>
              <div className="rounded-lg p-3 text-center bg-white">
                <p className="text-2xl font-bold text-red-600">{summary.failed}</p>
                <p className="text-xs text-red-500">Failed</p>
              </div>
              <div className="rounded-lg p-3 text-center bg-white">
                <p className="text-2xl font-bold" style={{ color: "#0ea5e9" }}>{summary.totalFiles.toLocaleString()}</p>
                <p className="text-xs" style={{ color: "#0284c7" }}>Files Uploaded</p>
              </div>
            </div>
          </div>
        )}

        {/* Live Results */}
        {results.length > 0 && (
          <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>Live Results (100 terakhir)</h3>
            </div>
            <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: "var(--border)" }}>
              {results.slice().reverse().map((r, i) => (
                <div key={i} className="px-6 py-3 flex items-center gap-3 text-sm">
                  {r.status === "success" ? (
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="size-4 text-red-500 shrink-0" />
                  )}
                  <code className="flex-1 truncate" style={{ color: "var(--secondary-foreground)" }}>{r.url}</code>
                  {r.status === "success" ? (
                    <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", borderColor: "transparent" }}>
                      {r.filesDeployed} files • {(r.durationMs / 1000).toFixed(1)}s
                    </Badge>
                  ) : (
                    <span className="text-xs text-red-500 truncate max-w-md">{r.message}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SidebarInset>
  )
}
