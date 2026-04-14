"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Globe,
  Zap,
  Send,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Server as ServerIcon,
  XCircle,
} from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

interface PingResult {
  domainId: string
  url: string
  success: boolean
  status: number
  message: string
  urlsSubmitted: number
  submittedAt: string
}

interface PingStats {
  totalPinged: number
  successCount: number
  failedCount: number
  lastPinged: string | null
  deployedCount: number
  neverPingedCount: number
  recentPings: Array<{
    domainId: string
    domainName: string
    domainUrl: string
    status: string
    message: string
    pingedAt: string
  }>
}

interface DomainPingInfo {
  id: string
  name: string
  url: string
  genre: string
  lastDeployed: string | null
  serverName: string
  serverHost: string
  isPinged: boolean
  pingStatus: string | null
  pingMessage: string | null
  lastPinged: string | null
}

interface DomainsData {
  total: number
  pingedCount: number
  notPingedCount: number
  pinged: DomainPingInfo[]
  notPinged: DomainPingInfo[]
}

export default function GooglePingPage() {
  const [stats, setStats] = useState<PingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pinging, setPinging] = useState(false)
  const [pingMode, setPingMode] = useState<string | null>(null)
  const [pingProgress, setPingProgress] = useState({ current: 0, total: 0 })
  const [pingResults, setPingResults] = useState<PingResult[] | null>(null)

  // Domain list state
  const [domainsData, setDomainsData] = useState<DomainsData | null>(null)
  const [domainsLoading, setDomainsLoading] = useState(false)
  const [domainTab, setDomainTab] = useState<"not-pinged" | "pinged">("not-pinged")
  const [domainSearch, setDomainSearch] = useState("")
  const [domainGenreFilter, setDomainGenreFilter] = useState("")
  const [domainPage, setDomainPage] = useState(1)
  const perPage = 25

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/google-ping")
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Gagal memuat data")
        return
      }
      setStats(data)
    } catch {
      setError("Gagal terhubung ke server")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDomains = useCallback(async () => {
    setDomainsLoading(true)
    try {
      const res = await fetch("/api/google-ping/domains")
      const data = await res.json()
      if (res.ok) setDomainsData(data)
    } catch {
      // silent
    } finally {
      setDomainsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
    loadDomains()
  }, [loadStats, loadDomains])

  async function handlePing(mode: "deployed" | "never-pinged") {
    setPinging(true)
    setPingMode(mode)
    setPingResults(null)
    setError(null)

    const total = mode === "never-pinged" ? (stats?.neverPingedCount || 0) : (stats?.deployedCount || 0)
    setPingProgress({ current: 0, total: Math.min(total, 50) })

    try {
      const res = await fetch("/api/google-ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Ping gagal")
        return
      }
      // Handle both old format (results array) and single result
      const results = data.results || (data.result ? [data.result] : [])
      setPingResults(results)
      setPingProgress({ current: results.length, total: results.length })
      loadStats()
      loadDomains()
    } catch {
      setError("Ping gagal — network error")
    } finally {
      setPinging(false)
      setPingMode(null)
    }
  }

  // Filtered domain list
  const currentList = domainTab === "not-pinged" ? (domainsData?.notPinged || []) : (domainsData?.pinged || [])
  const filteredDomains = currentList.filter((d) => {
    if (domainGenreFilter && d.genre !== domainGenreFilter) return false
    if (!domainSearch) return true
    const q = domainSearch.toLowerCase()
    return (
      d.url.toLowerCase().includes(q) ||
      d.name.toLowerCase().includes(q) ||
      d.serverName.toLowerCase().includes(q) ||
      d.serverHost.toLowerCase().includes(q)
    )
  })
  const totalPages = Math.ceil(filteredDomains.length / perPage)
  const paginatedDomains = filteredDomains.slice((domainPage - 1) * perPage, domainPage * perPage)

  // Unique genres for filter
  const genres = [...new Set(currentList.map((d) => d.genre).filter(Boolean))].sort()

  return (
    <SidebarInset>
      <AppHeader title="Google Ping" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center size-10 rounded-xl"
              style={{ background: "rgba(14,165,233,0.1)" }}
            >
              <Search className="size-5" style={{ color: "#0ea5e9" }} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>
                Google Ping / Indexing
              </h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Notifikasi Google & Bing agar crawl sitemap domain kamu
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-lg"
            style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
            onClick={() => { setLoading(true); loadStats(); loadDomains() }}
            disabled={loading}
          >
            {loading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
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

        {/* Loading */}
        {loading && !stats && (
          <div className="rounded-xl border p-12 text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <Loader2 className="size-8 mx-auto animate-spin mb-3" style={{ color: "#0ea5e9" }} />
            <p style={{ color: "var(--muted-foreground)" }}>Memuat data ping...</p>
          </div>
        )}

        {stats && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <Globe className="size-5" style={{ color: "#0ea5e9" }} />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Sudah Deploy</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{stats.deployedCount}</p>
              </div>
              <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <Send className="size-5 text-emerald-500" />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Sudah Ping</p>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{stats.totalPinged}</p>
              </div>
              <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <Zap className="size-5" style={{ color: "#f59e0b" }} />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Belum Ping</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{stats.neverPingedCount}</p>
              </div>
              <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <Clock className="size-5" style={{ color: "var(--muted-foreground)" }} />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Terakhir Ping</p>
                </div>
                <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                  {stats.lastPinged
                    ? new Date(stats.lastPinged).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "Belum pernah"}
                </p>
              </div>
            </div>

            {/* How It Works */}
            <div className="rounded-xl border p-5 mb-6 shadow-sm" style={{ background: "rgba(14,165,233,0.1)", borderColor: "#bae6fd" }}>
              <h3 className="font-semibold mb-2" style={{ color: "#0369a1" }}>Cara Domain Muncul di Google</h3>
              <div className="grid grid-cols-3 gap-4 text-sm" style={{ color: "#0c4a6e" }}>
                <div className="flex items-start gap-2">
                  <span className="flex items-center justify-center size-6 rounded-full bg-[#0ea5e9] text-white text-xs font-bold shrink-0">1</span>
                  <p><strong>Inter-PBN Linking</strong> — setiap domain punya link ke 2-3 domain PBN lain di footer + artikel (otomatis saat deploy)</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="flex items-center justify-center size-6 rounded-full bg-[#0ea5e9] text-white text-xs font-bold shrink-0">2</span>
                  <p><strong>robots.txt + sitemap.xml</strong> — sudah di-generate otomatis, Google baca ini saat crawl</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="flex items-center justify-center size-6 rounded-full bg-[#0ea5e9] text-white text-xs font-bold shrink-0">3</span>
                  <p><strong>Google crawl</strong> — Googlebot ikuti link antar PBN → temukan domain baru → index dalam 1-4 minggu</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="rounded-xl border p-6 mb-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>Submit ke IndexNow (Bing & Yandex)</h3>
              <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>
                Kirim URL ke IndexNow API agar Bing & Yandex langsung crawl domain kamu. Untuk Google, pakai inter-PBN links (otomatis saat deploy).
              </p>

              {pinging && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium" style={{ color: "var(--secondary-foreground)" }}>
                      Pinging... {pingProgress.current} / {pingProgress.total}
                    </span>
                    <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {pingProgress.total > 0 ? `${Math.round((pingProgress.current / pingProgress.total) * 100)}%` : "0%"}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pingProgress.total > 0 ? (pingProgress.current / pingProgress.total) * 100 : 0}%`,
                        background: "linear-gradient(90deg, #0ea5e9, #0284c7)",
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                {stats.neverPingedCount > 0 && (
                  <Button
                    className="rounded-lg shadow-lg"
                    style={{ background: "#0ea5e9", color: "#ffffff", boxShadow: "0 4px 14px rgba(14,165,233,0.3)" }}
                    onClick={() => handlePing("never-pinged")}
                    disabled={pinging}
                  >
                    {pinging && pingMode === "never-pinged" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Zap className="size-4 mr-1" />}
                    Submit yang Belum Pernah ({Math.min(stats.neverPingedCount, 50)})
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="rounded-lg"
                  style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  onClick={() => handlePing("deployed")}
                  disabled={pinging || stats.deployedCount === 0}
                >
                  {pinging && pingMode === "deployed" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Send className="size-4 mr-1" />}
                  Submit Ulang Semua ({Math.min(stats.deployedCount, 50)})
                </Button>
              </div>
            </div>

            {/* IndexNow Results (after bulk submit) */}
            {pingResults && pingResults.length > 0 && (
              <div className="rounded-xl border p-6 mb-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <h3 className="font-semibold mb-4" style={{ color: "var(--foreground)" }}>
                  Hasil IndexNow ({pingResults.length} domain)
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="rounded-lg p-3 text-center" style={{ background: "rgba(16,185,129,0.1)" }}>
                    <p className="text-2xl font-bold text-emerald-600">{pingResults.filter((r) => r.success).length}</p>
                    <p className="text-xs text-emerald-500">Berhasil</p>
                  </div>
                  <div className="rounded-lg p-3 text-center" style={{ background: "rgba(239,68,68,0.1)" }}>
                    <p className="text-2xl font-bold text-red-600">{pingResults.filter((r) => !r.success).length}</p>
                    <p className="text-xs text-red-500">Gagal</p>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "var(--background)" }}>
                        <th className="text-left p-3 font-medium" style={{ color: "var(--muted-foreground)" }}>Domain</th>
                        <th className="text-center p-3 font-medium" style={{ color: "var(--muted-foreground)" }}>Status</th>
                        <th className="text-center p-3 font-medium" style={{ color: "var(--muted-foreground)" }}>URLs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pingResults.map((r, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: "var(--muted)" }}>
                          <td className="p-3">
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#0ea5e9] hover:underline flex items-center gap-1">
                              {r.url.replace(/^https?:\/\//, "")}
                              <ExternalLink className="size-3" />
                            </a>
                          </td>
                          <td className="p-3 text-center">
                            {r.success
                              ? <Badge className="bg-emerald-100 text-emerald-700">OK</Badge>
                              : <Badge className="bg-red-100 text-red-700">{r.status || "Fail"}</Badge>}
                          </td>
                          <td className="p-3 text-center" style={{ color: "var(--muted-foreground)" }}>
                            {r.urlsSubmitted}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ═══ Domain List (like Health Check) ═══ */}
            {domainsData && (
              <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                {/* Tab header */}
                <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center size-9 rounded-lg" style={{ background: "rgba(14,165,233,0.1)" }}>
                      <Globe className="size-4" style={{ color: "#0ea5e9" }} />
                    </div>
                    <div>
                      <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>
                        Daftar Domain ({domainsData.total} deployed)
                      </h3>
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        Lihat status ping setiap domain yang sudah di-deploy
                      </p>
                    </div>
                  </div>
                  {domainsLoading && <Loader2 className="size-4 animate-spin" style={{ color: "var(--muted-foreground)" }} />}
                </div>

                {/* Tabs: Belum Ping / Sudah Ping */}
                <div className="px-6 py-3 border-b flex gap-2" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                  <button
                    onClick={() => { setDomainTab("not-pinged"); setDomainPage(1); setDomainSearch(""); setDomainGenreFilter("") }}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: domainTab === "not-pinged" ? "#f59e0b" : "transparent",
                      color: domainTab === "not-pinged" ? "#ffffff" : "var(--muted-foreground)",
                      boxShadow: domainTab === "not-pinged" ? "0 2px 8px rgba(245,158,11,0.3)" : "none",
                    }}
                  >
                    <XCircle className="size-3.5 inline mr-1.5 -mt-0.5" />
                    Belum Ping ({domainsData.notPingedCount})
                  </button>
                  <button
                    onClick={() => { setDomainTab("pinged"); setDomainPage(1); setDomainSearch(""); setDomainGenreFilter("") }}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: domainTab === "pinged" ? "#10b981" : "transparent",
                      color: domainTab === "pinged" ? "#ffffff" : "var(--muted-foreground)",
                      boxShadow: domainTab === "pinged" ? "0 2px 8px rgba(16,185,129,0.3)" : "none",
                    }}
                  >
                    <CheckCircle2 className="size-3.5 inline mr-1.5 -mt-0.5" />
                    Sudah Ping ({domainsData.pingedCount})
                  </button>
                </div>

                {/* Search + genre filter */}
                <div className="px-6 py-4 border-b flex flex-wrap gap-3 items-center" style={{ borderColor: "var(--border)" }}>
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--muted-foreground)" }} />
                    <Input
                      placeholder="Cari domain, server, IP..."
                      value={domainSearch}
                      onChange={(e) => { setDomainSearch(e.target.value); setDomainPage(1) }}
                      className="pl-10 rounded-lg"
                      style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                    />
                  </div>
                  {genres.length > 0 && (
                    <select
                      value={domainGenreFilter}
                      onChange={(e) => { setDomainGenreFilter(e.target.value); setDomainPage(1) }}
                      className="h-9 rounded-lg border px-3 text-sm"
                      style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                    >
                      <option value="">Semua Genre ({currentList.length})</option>
                      {genres.map((g) => (
                        <option key={g} value={g}>{g} ({currentList.filter((d) => d.genre === g).length})</option>
                      ))}
                    </select>
                  )}
                  {(domainSearch || domainGenreFilter) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-lg h-9"
                      style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                      onClick={() => { setDomainSearch(""); setDomainGenreFilter(""); setDomainPage(1) }}
                    >
                      Reset
                    </Button>
                  )}
                  <span className="text-xs whitespace-nowrap" style={{ color: "var(--muted-foreground)" }}>
                    {filteredDomains.length} hasil
                  </span>
                </div>

                {/* Domain table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead style={{ background: "var(--background)" }}>
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Domain</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Genre</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Server</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Deploy</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                          {domainTab === "pinged" ? "Ping Status" : "Status"}
                        </th>
                        {domainTab === "pinged" && (
                          <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Terakhir Ping</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                      {paginatedDomains.map((d) => (
                        <tr key={d.id} className="hover:bg-[color:rgba(148,163,184,0.08)] transition-colors">
                          <td className="px-6 py-3">
                            <div className="flex flex-col">
                              <a
                                href={d.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium hover:underline flex items-center gap-1"
                                style={{ color: "#0ea5e9" }}
                              >
                                {d.url.replace(/^https?:\/\//, "")}
                                <ExternalLink className="size-3" />
                              </a>
                              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{d.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            {d.genre ? (
                              <Badge variant="outline" className="text-[10px]" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderColor: "transparent" }}>
                                {d.genre}
                              </Badge>
                            ) : (
                              <span style={{ color: "var(--muted-foreground)" }}>—</span>
                            )}
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <ServerIcon className="size-3" style={{ color: "var(--muted-foreground)" }} />
                              <div>
                                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{d.serverName || "—"}</span>
                                {d.serverHost && (
                                  <span className="text-[10px] block font-mono" style={{ color: "var(--muted-foreground)" }}>{d.serverHost}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                            {d.lastDeployed
                              ? new Date(d.lastDeployed).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                              : "—"}
                          </td>
                          <td className="px-6 py-3">
                            {d.isPinged ? (
                              d.pingStatus === "success" ? (
                                <Badge className="bg-emerald-100 text-emerald-700">
                                  <CheckCircle2 className="size-3 mr-1" />
                                  OK
                                </Badge>
                              ) : (
                                <Badge className="bg-red-100 text-red-700">
                                  <AlertCircle className="size-3 mr-1" />
                                  Gagal
                                </Badge>
                              )
                            ) : (
                              <Badge className="bg-amber-100 text-amber-700">
                                <Zap className="size-3 mr-1" />
                                Belum
                              </Badge>
                            )}
                          </td>
                          {domainTab === "pinged" && (
                            <td className="px-6 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                              {d.lastPinged
                                ? new Date(d.lastPinged).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                                : "—"}
                            </td>
                          )}
                        </tr>
                      ))}
                      {paginatedDomains.length === 0 && (
                        <tr>
                          <td colSpan={domainTab === "pinged" ? 6 : 5} className="px-6 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                            {domainSearch || domainGenreFilter
                              ? "Tidak ada domain yang cocok dengan filter."
                              : domainTab === "not-pinged"
                                ? "Semua domain sudah di-ping!"
                                : "Belum ada domain yang di-ping."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-3 border-t" style={{ borderColor: "var(--border)" }}>
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      Menampilkan {(domainPage - 1) * perPage + 1}–{Math.min(domainPage * perPage, filteredDomains.length)} dari {filteredDomains.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" disabled={domainPage <= 1} onClick={() => setDomainPage((p) => p - 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        let page: number
                        if (totalPages <= 7) page = i + 1
                        else if (domainPage <= 4) page = i + 1
                        else if (domainPage >= totalPages - 3) page = totalPages - 6 + i
                        else page = domainPage - 3 + i
                        return (
                          <Button
                            key={page}
                            variant={domainPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => setDomainPage(page)}
                            className={`h-8 w-8 p-0 ${domainPage === page ? "bg-[#0ea5e9] text-white hover:bg-[#0284c7]" : ""}`}
                            style={domainPage !== page ? { borderColor: "var(--border)", color: "var(--secondary-foreground)" } : {}}
                          >
                            {page}
                          </Button>
                        )
                      })}
                      <Button variant="outline" size="sm" disabled={domainPage >= totalPages} onClick={() => setDomainPage((p) => p + 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
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
