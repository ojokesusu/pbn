"use client"

import React, { useEffect, useState, useCallback } from "react"
import { Activity, CheckCircle2, XCircle, FileText, Loader2, RefreshCw, Heart, Search, Server as ServerIcon, AlertTriangle, ChevronLeft, ChevronRight, Lightbulb, ChevronDown } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { useConfirm } from "@/components/ui/confirm-modal"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

interface Stats {
  total: number
  checked: number
  alive: number
  dead: number
  withWordPress: number
  totalPosts: number
  lastCheck: string | null
}

interface CheckResult {
  domainId: string
  url: string
  isAlive: boolean
  httpStatus: number
  hasWordPress: boolean
  wpPostCount: number
  error?: string
}

interface DeadDomain {
  id: string
  url: string
  name: string
  genre: string
  httpStatus: number
  lastChecked: string | null
  server: { id: string; name: string; host: string } | null
}

interface DeadData {
  total: number
  domains: DeadDomain[]
  byReason: Array<{ reason: string; count: number }>
  byServer: Array<{ serverName: string; serverHost: string; count: number }>
}

// Tips for fixing dead domains, keyed by HTTP status code (0 = timeout/DNS).
type FixTip = {
  label: string
  emoji: string
  cause: string
  steps: string[]
  color: string
}

const FIX_TIPS: Record<number, FixTip> = {
  0: {
    label: "Timeout / DNS",
    emoji: "🌐",
    color: "#f59e0b",
    cause: "Server tidak merespons sama sekali — biasanya DNS belum propagate, IP A record salah, atau server mati.",
    steps: [
      "Login ke Cloudflare → DNS → cek A record domain ini, pastikan IP-nya sama dengan IP server di tabel ini.",
      "Buka terminal lalu jalankan: ping namadomain.com — kalau \"unknown host\" berarti DNS belum jalan.",
      "Tunggu propagasi DNS 5–30 menit setelah ubah, lalu klik Refresh di Health Check.",
      "Kalau ping reply tapi web masih mati: server cPanel mungkin down, hubungi penyedia hosting.",
    ],
  },
  403: {
    label: "Forbidden",
    emoji: "🚫",
    color: "#ef4444",
    cause: "Server menerima request tapi menolak akses. Biasanya file permission, .htaccess, atau index file yang salah.",
    steps: [
      "Login cPanel → File Manager → public_html → cek permission folder = 755, file = 644.",
      "Cek file .htaccess di public_html — kalau ada rule aneh (deny from all) hapus dulu.",
      "Pastikan ada file index.html di public_html (bukan cuma index.php).",
      "Coba akses langsung file: namadomain.com/index.html — kalau 403 juga, masalah di permission.",
    ],
  },
  404: {
    label: "Not Found",
    emoji: "📂",
    color: "#f59e0b",
    cause: "Server hidup tapi tidak ada file di public_html. Domain belum di-deploy atau file ke-hapus.",
    steps: [
      "Buka menu Deploy di dashboard ini, cari domain ini, klik Deploy ulang.",
      "Setelah deploy selesai, klik Refresh di Health Check untuk verifikasi.",
      "Kalau masih 404 setelah re-deploy: cek folder root di cPanel apakah file index.html benar-benar masuk.",
    ],
  },
  500: {
    label: "Server Error",
    emoji: "💥",
    color: "#ef4444",
    cause: "Ada error di server saat proses request. Biasanya .htaccess corrupt, PHP error, atau script bug.",
    steps: [
      "Login cPanel → Error Log (atau \"Errors\") — lihat baris error terakhir untuk domain ini.",
      "Cek .htaccess di public_html — coba rename ke .htaccess.bak lalu reload domain.",
      "Kalau pakai PHP: cek versi PHP di cPanel → MultiPHP Manager, ganti ke versi yang stabil (8.1 atau 8.2).",
      "Kalau gak ketemu, deploy ulang dari menu Deploy untuk reset semua file.",
    ],
  },
  502: {
    label: "Bad Gateway",
    emoji: "🔌",
    color: "#ef4444",
    cause: "Reverse proxy / Cloudflare tidak bisa connect ke server origin.",
    steps: [
      "Cek status server di cPanel — apakah Apache/Nginx running.",
      "Login Cloudflare → SSL/TLS → pastikan mode \"Full\" (bukan \"Full Strict\") jika SSL belum lengkap.",
      "Hubungi hosting provider — biasanya ini masalah di sisi server, bukan kita.",
      "Coba purge cache Cloudflare di menu Cloudflare dashboard ini.",
    ],
  },
  503: {
    label: "Service Unavailable",
    emoji: "⏸️",
    color: "#f59e0b",
    cause: "Server overload, maintenance, atau di-suspend hosting.",
    steps: [
      "Coba lagi 5–10 menit kemudian, mungkin server cuma overload sementara.",
      "Login cPanel — kalau gak bisa login, akun mungkin di-suspend (cek email dari hosting).",
      "Kalau sering 503: upgrade hosting plan atau pindah server.",
    ],
  },
  504: {
    label: "Gateway Timeout",
    emoji: "⏱️",
    color: "#f59e0b",
    cause: "Server origin terlalu lambat merespons sehingga proxy/Cloudflare timeout.",
    steps: [
      "Cek beban server di cPanel → CPU usage. Kalau merah, kurangi proses berat.",
      "Cloudflare → Caching → set Cache Level: Standard, supaya request berkurang.",
      "Hubungi hosting kalau berulang.",
    ],
  },
  525: {
    label: "SSL Handshake Failed",
    emoji: "🔒",
    color: "#ef4444",
    cause: "Cloudflare tidak bisa SSL handshake dengan server origin.",
    steps: [
      "Login Cloudflare → SSL/TLS → ganti mode dari \"Full Strict\" ke \"Full\" (atau \"Flexible\").",
      "Cek di cPanel → SSL/TLS Status: pastikan domain punya sertifikat aktif.",
      "Install AutoSSL kalau belum: cPanel → SSL/TLS → AutoSSL → Manage AutoSSL.",
    ],
  },
  526: {
    label: "Invalid SSL Certificate",
    emoji: "🔐",
    color: "#ef4444",
    cause: "Sertifikat SSL di server origin expired atau tidak valid.",
    steps: [
      "Login cPanel → SSL/TLS → Manage SSL Sites — cek tanggal expired sertifikat.",
      "Renew sertifikat lewat AutoSSL atau install Let's Encrypt baru.",
      "Sambil menunggu fix, set Cloudflare SSL mode ke \"Flexible\" (sementara).",
    ],
  },
}

const GENERIC_TIP: FixTip = {
  label: "Error Lain",
  emoji: "❓",
  color: "#64748b",
  cause: "HTTP status tidak masuk daftar tip umum. Biasanya butuh investigasi manual.",
  steps: [
    "Buka domain di browser secara manual — lihat pesan error apa yang muncul.",
    "Cek di cPanel → Error Log untuk detail error server.",
    "Coba ping & traceroute domain dari terminal.",
    "Kalau ragu, hubungi hosting provider dengan menyebut HTTP status code-nya.",
  ],
}

function getTip(status: number): FixTip {
  return FIX_TIPS[status] || GENERIC_TIP
}

export default function HealthCheckPage() {
  const confirm = useConfirm()
  const [stats, setStats] = useState<Stats | null>(null)
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [recentResults, setRecentResults] = useState<CheckResult[]>([])
  // Dead domains state
  const [deadData, setDeadData] = useState<DeadData | null>(null)
  const [deadLoading, setDeadLoading] = useState(false)
  const [deadSearch, setDeadSearch] = useState("")
  const [deadServerFilter, setDeadServerFilter] = useState("")
  const [deadPage, setDeadPage] = useState(1)
  const [expandedTip, setExpandedTip] = useState<string | null>(null)
  const deadPerPage = 25

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/health-check")
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err)
    }
  }, [])

  const fetchDead = useCallback(async () => {
    setDeadLoading(true)
    try {
      const res = await fetch("/api/health-check/dead")
      if (res.ok) {
        const data = await res.json()
        setDeadData(data)
      }
    } catch (err) {
      console.error("Failed to fetch dead domains:", err)
    } finally {
      setDeadLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
    fetchDead()
  }, [fetchStats, fetchDead])

  // Filtered dead domains
  const filteredDead = (deadData?.domains || []).filter((d) => {
    if (deadServerFilter && d.server?.name !== deadServerFilter) return false
    if (!deadSearch) return true
    const q = deadSearch.toLowerCase()
    return (
      d.url.toLowerCase().includes(q) ||
      d.name.toLowerCase().includes(q) ||
      (d.server?.host || "").toLowerCase().includes(q) ||
      (d.server?.name || "").toLowerCase().includes(q)
    )
  })
  const deadTotalPages = Math.ceil(filteredDead.length / deadPerPage)
  const paginatedDead = filteredDead.slice((deadPage - 1) * deadPerPage, deadPage * deadPerPage)

  async function runBatchCheck(opts: {
    mode: "all" | "dead" | "deployed"
    total: number
    confirmMessage: string
  }) {
    if (opts.total === 0) {
      alert("Tidak ada domain untuk dicek")
      return
    }
    const ok = await confirm({ message: opts.confirmMessage })
    if (!ok) return

    setChecking(true)
    setRecentResults([])
    const batchSize = 25
    setProgress({ current: 0, total: opts.total })

    const allResults: CheckResult[] = []

    try {
      for (let offset = 0; offset < opts.total; offset += batchSize) {
        const body: Record<string, unknown> = { limit: batchSize, offset }
        if (opts.mode === "all") body.all = true
        else body.filter = opts.mode

        const res = await fetch("/api/health-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) {
          alert(data.error || "Check gagal")
          break
        }
        allResults.push(...data.results)
        setRecentResults(allResults.slice(-50))
        setProgress({ current: Math.min(offset + batchSize, opts.total), total: opts.total })

        // Stop early if a filter run returned fewer than a batch (no more matches)
        if (opts.mode !== "all" && data.results.length < batchSize) break
      }
      fetchStats()
      fetchDead()
    } catch (err) {
      console.error(err)
    } finally {
      setChecking(false)
    }
  }

  async function handleCheckAll() {
    if (!stats) return
    await runBatchCheck({
      mode: "all",
      total: stats.total,
      confirmMessage: `Cek ${stats.total} domain (semua)?\n\nPerkiraan waktu: ${Math.ceil((stats.total / 25) * 8)} detik.`,
    })
  }

  async function handleCheckDead() {
    if (!stats) return
    const deadCount = stats.dead
    await runBatchCheck({
      mode: "dead",
      total: deadCount,
      confirmMessage: `Cek ulang ${deadCount} domain yang mati saja?\n\nFast mode — hanya domain yang currently dead yang akan di-ping ulang.\nBerguna setelah fix DNS/FTP/cPanel untuk verifikasi sudah hidup.`,
    })
  }

  async function handleCheckDeployed() {
    // Deployed count isn't in stats state here, fetch separately via body
    const res = await fetch("/api/domains?deployedOnly=1")
    let deployedCount = 43
    try {
      const data = await res.json()
      if (Array.isArray(data)) {
        deployedCount = data.filter((d: { lastDeployed: string | null }) => d.lastDeployed).length
      }
    } catch {}

    await runBatchCheck({
      mode: "deployed",
      total: deployedCount,
      confirmMessage: `Cek ${deployedCount} domain yang sudah di-deploy?\n\nFastest mode — hanya domain yang aktif dengan konten live.\nPrioritas monitoring utama.`,
    })
  }

  function formatDate(s: string) {
    return new Date(s).toLocaleString("id-ID")
  }

  return (
    <SidebarInset>
      <AppHeader title="Domain Health Check" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl" style={{ background: "rgba(239,68,68,0.1)" }}>
              <Heart className="size-5" style={{ color: "#ef4444" }} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Domain Health Check</h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Ping semua domain & deteksi WordPress REST API</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-lg"
            style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
            onClick={() => { fetchStats(); fetchDead(); }}
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
                <Activity className="size-4" style={{ color: "#0ea5e9" }} />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Total</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{stats.total}</p>
            </div>

            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Alive</p>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{stats.alive}</p>
            </div>

            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="size-4 text-red-500" />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Dead</p>
              </div>
              <p className="text-2xl font-bold text-red-600">{stats.dead}</p>
            </div>

            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="size-4" style={{ color: "#a855f7" }} />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>WordPress</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "#a855f7" }}>{stats.withWordPress}</p>
            </div>

            <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-2">
                <FileText className="size-4" style={{ color: "#f59e0b" }} />
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Total Posts</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{stats.totalPosts.toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* Action */}
        <div className="rounded-xl border p-6 mb-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h3 className="font-semibold mb-2" style={{ color: "var(--foreground)" }}>Jalankan Health Check</h3>
          <p className="text-sm mb-3" style={{ color: "var(--muted-foreground)" }}>
            Pilih mode yang sesuai — mode cepat untuk verifikasi setelah fix, mode lengkap untuk audit rutin.
            {stats?.lastCheck && (
              <span className="block mt-1 text-xs">Terakhir dicek: {formatDate(stats.lastCheck)}</span>
            )}
          </p>

          {/* Mode explanation */}
          <div className="grid gap-2 md:grid-cols-3 mb-4 text-[11px]">
            <div className="rounded-lg border px-3 py-2" style={{ background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.25)" }}>
              <div className="font-semibold" style={{ color: "#10b981" }}>✓ Cek Deployed Saja</div>
              <div style={{ color: "var(--muted-foreground)" }}>Paling cepat. Hanya domain yang sudah live. Mode harian.</div>
            </div>
            <div className="rounded-lg border px-3 py-2" style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.25)" }}>
              <div className="font-semibold" style={{ color: "#f59e0b" }}>↻ Cek Dead Saja</div>
              <div style={{ color: "var(--muted-foreground)" }}>Verifikasi fix. Hanya domain yang currently dead.</div>
            </div>
            <div className="rounded-lg border px-3 py-2" style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)" }}>
              <div className="font-semibold" style={{ color: "#ef4444" }}>♥ Cek Semua</div>
              <div style={{ color: "var(--muted-foreground)" }}>Audit lengkap. Lambat. Seminggu sekali cukup.</div>
            </div>
          </div>

          {checking && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium" style={{ color: "var(--secondary-foreground)" }}>
                  Checking... {progress.current} / {progress.total}
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
                    background: "linear-gradient(90deg, #ef4444, #dc2626)",
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleCheckDeployed}
              disabled={checking || !stats || stats.total === 0}
              className="rounded-lg shadow-lg shadow-emerald-500/20"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#ffffff" }}
              title="Hanya cek domain yang sudah deploy (paling penting)"
            >
              {checking ? <Loader2 className="size-4 mr-1 animate-spin" /> : <CheckCircle2 className="size-4 mr-1" />}
              Cek Deployed Saja
            </Button>
            <Button
              onClick={handleCheckDead}
              disabled={checking || !stats || stats.dead === 0}
              className="rounded-lg shadow-lg shadow-amber-500/20"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#ffffff" }}
              title="Cek ulang domain yang currently dead — verifikasi fix"
            >
              {checking ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
              Cek Dead Saja ({stats?.dead ?? 0})
            </Button>
            <Button
              className="bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-lg shadow-lg shadow-[#ef4444]/20"
              onClick={handleCheckAll}
              disabled={checking || !stats || stats.total === 0}
              title="Cek semua domain — lambat tapi lengkap"
            >
              {checking ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Heart className="size-4 mr-1" />}
              {checking ? "Checking..." : `Cek Semua (${stats?.total || 0})`}
            </Button>
          </div>
        </div>

        {/* Recent Results */}
        {recentResults.length > 0 && (
          <div className="rounded-xl border shadow-sm overflow-hidden mb-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>Hasil Recent (50 terakhir)</h3>
            </div>
            <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: "var(--border)" }}>
              {recentResults.slice().reverse().map((r, i) => (
                <div key={i} className="px-6 py-3 flex items-center gap-3 text-sm">
                  {r.isAlive ? (
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="size-4 text-red-500 shrink-0" />
                  )}
                  <code className="flex-1 truncate" style={{ color: "var(--secondary-foreground)" }}>{r.url}</code>
                  <Badge variant="outline" className="text-[10px]" style={{
                    color: r.httpStatus >= 200 && r.httpStatus < 300 ? "#10b981" : r.httpStatus >= 300 && r.httpStatus < 400 ? "#f59e0b" : "#ef4444",
                    borderColor: "transparent",
                    background: r.httpStatus >= 200 && r.httpStatus < 300 ? "rgba(16,185,129,0.1)" : r.httpStatus >= 300 && r.httpStatus < 400 ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                  }}>
                    HTTP {r.httpStatus || "—"}
                  </Badge>
                  {r.hasWordPress && (
                    <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", borderColor: "transparent" }}>
                      WP {r.wpPostCount}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === Dead Domains List (for team to fix) === */}
        {deadData && deadData.total > 0 && (
          <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center size-9 rounded-lg" style={{ background: "rgba(239,68,68,0.1)" }}>
                  <AlertTriangle className="size-4" style={{ color: "#ef4444" }} />
                </div>
                <div>
                  <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>Domain Mati ({deadData.total})</h3>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Domain yang gagal HTTP ping — perlu di-fix oleh tim</p>
                </div>
              </div>
              {deadLoading && <Loader2 className="size-4 animate-spin" style={{ color: "var(--muted-foreground)" }} />}
            </div>

            {/* Reason summary chips */}
            {deadData.byReason.length > 0 && (
              <div className="px-6 py-3 border-b flex flex-wrap gap-2" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                <span className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>Alasan:</span>
                {deadData.byReason.map((r) => (
                  <Badge key={r.reason} variant="outline" className="text-[11px]" style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626", borderColor: "rgba(239,68,68,0.2)" }}>
                    {r.reason}: <strong className="ml-1">{r.count}</strong>
                  </Badge>
                ))}
              </div>
            )}

            {/* Search + filter */}
            <div className="px-6 py-4 border-b flex flex-wrap gap-3 items-center" style={{ borderColor: "var(--border)" }}>
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--muted-foreground)" }} />
                <Input
                  placeholder="Cari domain, server, IP..."
                  value={deadSearch}
                  onChange={(e) => { setDeadSearch(e.target.value); setDeadPage(1) }}
                  className="pl-10 rounded-lg"
                  style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                />
              </div>
              {deadData.byServer.length > 0 && (
                <select
                  value={deadServerFilter}
                  onChange={(e) => { setDeadServerFilter(e.target.value); setDeadPage(1) }}
                  className="h-9 rounded-lg border px-3 text-sm"
                  style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                >
                  <option value="">Semua Server ({deadData.total})</option>
                  {deadData.byServer.slice(0, 20).map(s => (
                    <option key={s.serverName} value={s.serverName}>{s.serverName} ({s.count})</option>
                  ))}
                </select>
              )}
              {(deadSearch || deadServerFilter) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg h-9"
                  style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  onClick={() => { setDeadSearch(""); setDeadServerFilter(""); setDeadPage(1) }}
                >
                  Reset
                </Button>
              )}
              <span className="text-xs whitespace-nowrap" style={{ color: "var(--muted-foreground)" }}>
                {filteredDead.length} hasil
              </span>
            </div>

            {/* Dead domains table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "var(--background)" }}>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Domain</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Server</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>IP</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Dicek</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {paginatedDead.map((d) => {
                    const tip = getTip(d.httpStatus)
                    const isOpen = expandedTip === d.id
                    return (
                      <React.Fragment key={d.id}>
                        <tr
                          className="hover:bg-[color:rgba(148,163,184,0.08)] transition-colors cursor-pointer"
                          onClick={() => setExpandedTip(isOpen ? null : d.id)}
                        >
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <ChevronDown
                                className={`size-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                style={{ color: "var(--muted-foreground)" }}
                              />
                              <div className="flex flex-col">
                                <a
                                  href={d.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium hover:underline"
                                  style={{ color: "var(--secondary-foreground)" }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {d.url.replace(/^https?:\/\//, "")}
                                </a>
                                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{d.name}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3" style={{ color: "var(--muted-foreground)" }}>
                            <div className="flex items-center gap-2">
                              <ServerIcon className="size-3" style={{ color: "var(--muted-foreground)" }} />
                              <span className="text-xs">{d.server?.name || "—"}</span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                            {d.server?.host || "—"}
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px]" style={{
                                background: "rgba(239,68,68,0.1)",
                                color: "#dc2626",
                                borderColor: "transparent",
                              }}>
                                {d.httpStatus === 0 ? "TIMEOUT / DNS" : `HTTP ${d.httpStatus}`}
                              </Badge>
                              <Lightbulb
                                className="size-3.5"
                                style={{ color: tip.color }}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-3 text-xs">
                            {d.lastChecked ? (() => {
                              const ageMs = Date.now() - new Date(d.lastChecked).getTime()
                              const ageHours = ageMs / (1000 * 60 * 60)
                              const ageDays = ageHours / 24
                              let color = "#10b981" // <1h fresh
                              let label = ""
                              if (ageHours < 1) label = "Baru saja"
                              else if (ageHours < 24) { color = "#10b981"; label = `${Math.round(ageHours)}j lalu` }
                              else if (ageDays < 3) { color = "#f59e0b"; label = `${Math.round(ageDays)}h lalu` }
                              else { color = "var(--muted-foreground)"; label = `${Math.round(ageDays)}h lalu` }
                              return (
                                <div className="flex flex-col">
                                  <span className="font-medium" style={{ color }}>{label}</span>
                                  <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                                    {new Date(d.lastChecked).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                              )
                            })() : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                          </td>
                        </tr>

                        {isOpen && (
                          <tr style={{ background: "var(--muted)" }}>
                            <td colSpan={5} className="p-0">
                              <div className="p-4">
                                <div
                                  className="rounded-lg border p-4"
                                  style={{
                                    background: "var(--card)",
                                    borderColor: tip.color + "55",
                                    borderLeftWidth: 4,
                                  }}
                                >
                                  <div className="flex items-start gap-3 mb-3">
                                    <div
                                      className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                                      style={{ background: tip.color + "22" }}
                                    >
                                      {tip.emoji}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: tip.color }}>
                                        {d.httpStatus === 0 ? "Timeout / DNS" : `HTTP ${d.httpStatus}`} — {tip.label}
                                      </div>
                                      <div className="text-sm" style={{ color: "var(--foreground)" }}>
                                        <strong>Penyebab:</strong> {tip.cause}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                                    Cara Memperbaiki
                                  </div>
                                  <ol className="space-y-1.5 text-sm">
                                    {tip.steps.map((step, idx) => (
                                      <li key={idx} className="flex gap-2.5">
                                        <span
                                          className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                                          style={{ background: tip.color + "22", color: tip.color }}
                                        >
                                          {idx + 1}
                                        </span>
                                        <span style={{ color: "var(--secondary-foreground)" }}>{step}</span>
                                      </li>
                                    ))}
                                  </ol>

                                  <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2 text-[11px]" style={{ borderColor: "var(--border)" }}>
                                    <span style={{ color: "var(--muted-foreground)" }}>
                                      Setelah perbaikan, klik <b>Refresh</b> di atas untuk verifikasi.
                                    </span>
                                    <a
                                      href={d.url}
                                      target="_blank"
                                      rel="noopener"
                                      onClick={(e) => e.stopPropagation()}
                                      className="inline-flex items-center gap-1 text-[#0ea5e9] hover:underline"
                                    >
                                      Buka domain →
                                    </a>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                  {paginatedDead.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                        Tidak ada domain mati yang cocok dengan filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {deadTotalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t" style={{ borderColor: "var(--border)" }}>
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Menampilkan {(deadPage - 1) * deadPerPage + 1}–{Math.min(deadPage * deadPerPage, filteredDead.length)} dari {filteredDead.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={deadPage <= 1} onClick={() => setDeadPage(p => p - 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  {Array.from({ length: Math.min(deadTotalPages, 7) }, (_, i) => {
                    let page: number
                    if (deadTotalPages <= 7) page = i + 1
                    else if (deadPage <= 4) page = i + 1
                    else if (deadPage >= deadTotalPages - 3) page = deadTotalPages - 6 + i
                    else page = deadPage - 3 + i
                    return (
                      <Button key={page} variant={deadPage === page ? "default" : "outline"} size="sm" onClick={() => setDeadPage(page)} className={`h-8 w-8 p-0 ${deadPage === page ? "bg-[#ef4444] text-white hover:bg-[#dc2626]" : ""}`} style={deadPage !== page ? { borderColor: "var(--border)", color: "var(--secondary-foreground)" } : {}}>
                        {page}
                      </Button>
                    )
                  })}
                  <Button variant="outline" size="sm" disabled={deadPage >= deadTotalPages} onClick={() => setDeadPage(p => p + 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </SidebarInset>
  )
}
