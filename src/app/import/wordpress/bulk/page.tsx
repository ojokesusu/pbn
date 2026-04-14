"use client"

import { useEffect, useState, useCallback } from "react"
import { Zap, FileText, Globe, Loader2, CheckCircle2, XCircle, RefreshCw, AlertCircle } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { useConfirm } from "@/components/ui/confirm-modal"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"

interface Stats {
  readyDomains: number
  alreadyImported: number
  remainingDomains: number
  totalPostsAvailable: number
  articlesInDb: number
}

interface ImportResult {
  domainId: string
  url: string
  status: "success" | "failed" | "skipped"
  message: string
  imported: number
  totalAvailable: number
  themeGenerated: boolean
}

export default function BulkWordPressImportPage() {
  const confirm = useConfirm()
  const [stats, setStats] = useState<Stats | null>(null)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[]>([])
  const [maxArticles, setMaxArticles] = useState(20)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<{ success: number; failed: number; totalArticles: number } | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/import/wordpress/bulk")
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

  async function handleBulkImport() {
    if (!stats) return
    const ok = await confirm({ message: `Import konten WordPress dari ${stats.remainingDomains} domain?\n\nMax ${maxArticles} artikel per site. Akan mempertahankan slug asli + skip artikel yang sudah ada.` })
    if (!ok) return

    setImporting(true)
    setResults([])
    setSummary(null)
    setError(null)

    const batchSize = 10
    const total = stats.remainingDomains
    setProgress({ current: 0, total })

    let totalSuccess = 0
    let totalFailed = 0
    let totalArticles = 0
    const allResults: ImportResult[] = []

    try {
      for (let offset = 0; offset < total; offset += batchSize) {
        const res = await fetch("/api/import/wordpress/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: batchSize, offset, maxArticlesPerSite: maxArticles }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Bulk import gagal")
          break
        }
        allResults.push(...data.results)
        totalSuccess += data.summary.success
        totalFailed += data.summary.failed
        totalArticles += data.summary.totalArticles
        setResults(allResults.slice(-100))
        setProgress({ current: Math.min(offset + batchSize, total), total })
      }
      setSummary({ success: totalSuccess, failed: totalFailed, totalArticles })
      fetchStats()
    } catch (err) {
      setError(`Bulk import gagal: ${String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  return (
    <SidebarInset>
      <AppHeader title="Bulk WordPress Import" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl" style={{ background: "rgba(168,85,247,0.1)" }}>
              <Zap className="size-5" style={{ color: "#a855f7" }} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Bulk WordPress Import</h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Scrape semua WordPress site dalam 1 klik — auto pick artikel terbaik + auto theme</p>
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
          <div className="grid grid-cols-5 gap-4 mb-6">
            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Globe className="size-4" style={{ color: "#0ea5e9" }} />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>WP Ready</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{stats.readyDomains}</p>
            </div>

            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Sudah Diimport</p>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{stats.alreadyImported}</p>
            </div>

            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="size-4 text-amber-500" />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Belum Diimport</p>
              </div>
              <p className="text-2xl font-bold text-amber-600">{stats.remainingDomains}</p>
            </div>

            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="size-4" style={{ color: "#a855f7" }} />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Posts Available</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "#a855f7" }}>{stats.totalPostsAvailable.toLocaleString()}</p>
            </div>

            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="size-4" style={{ color: "#f59e0b" }} />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Artikel di DB</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{stats.articlesInDb.toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* Settings */}
        <div className="rounded-xl border p-6 mb-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h3 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Pengaturan Import</h3>

          <div className="mb-4">
            <Label className="text-sm" style={{ color: "var(--secondary-foreground)" }}>Max artikel per site</Label>
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range"
                min="5"
                max="50"
                value={maxArticles}
                onChange={(e) => setMaxArticles(parseInt(e.target.value))}
                className="flex-1 h-2 rounded-lg appearance-none cursor-pointer"
                style={{ background: "var(--border)" }}
                disabled={importing}
              />
              <span className="font-bold w-12 text-center" style={{ color: "#0ea5e9" }}>{maxArticles}</span>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
              Sistem otomatis pilih artikel terbaik (newest + has image + targeted by backlink)
            </p>
          </div>

          <div className="rounded-lg p-3 text-xs mb-4" style={{ background: "rgba(14,165,233,0.1)", color: "#0369a1" }}>
            <strong>💡 Smart features:</strong> Slug original dipertahankan • Artikel yang ditarget backlink WAJIB diimport • Tema unik auto-generate per site • Skip duplikat
          </div>

          {importing && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: "var(--secondary-foreground)" }}>
                  Importing... {progress.current} / {progress.total} domain
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
                    background: "linear-gradient(90deg, #a855f7, #7c3aed)",
                  }}
                />
              </div>
            </div>
          )}

          <Button
            className="bg-[#a855f7] hover:bg-[#7c3aed] text-white rounded-lg shadow-lg shadow-[#a855f7]/20"
            onClick={handleBulkImport}
            disabled={importing || !stats || stats.remainingDomains === 0}
          >
            {importing ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Zap className="size-4 mr-1" />}
            {importing ? "Importing..." : `Import ${stats?.remainingDomains || 0} Domain`}
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
              <h3 className="text-lg font-bold text-emerald-700">Bulk Import Selesai!</h3>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg p-3 text-center bg-white">
                <p className="text-2xl font-bold text-emerald-600">{summary.success}</p>
                <p className="text-xs text-emerald-500">Domains Success</p>
              </div>
              <div className="rounded-lg p-3 text-center bg-white">
                <p className="text-2xl font-bold text-red-600">{summary.failed}</p>
                <p className="text-xs text-red-500">Domains Failed</p>
              </div>
              <div className="rounded-lg p-3 text-center bg-white">
                <p className="text-2xl font-bold text-purple-600">{summary.totalArticles.toLocaleString()}</p>
                <p className="text-xs text-purple-500">Total Articles</p>
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
                    <>
                      <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", borderColor: "transparent" }}>
                        {r.imported}/{r.totalAvailable} articles
                      </Badge>
                      {r.themeGenerated && (
                        <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9", borderColor: "transparent" }}>
                          New theme
                        </Badge>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-red-500 truncate max-w-xs">{r.message}</span>
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
