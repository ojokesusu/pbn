"use client"

import { useEffect, useState, useCallback } from "react"
import { Clock, Play, Square, Loader2, RefreshCw, CheckCircle2, XCircle, Settings2, Globe, FileText, Zap } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { useConfirm } from "@/components/ui/confirm-modal"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"

interface SchedulerData {
  config: {
    isRunning: boolean
    articlesPerWeek: number
    timeWindowStart: number
    timeWindowEnd: number
    autoDeploy: boolean
    autoPurgeCache: boolean
    initialArticles: number
    maxDomainsPerDay: number
  }
  stats: {
    totalDomains: number
    activeDomains: number
    pendingJobs: number
    todayGenerated: number
    todayDeployed: number
    nextScheduled: { domain: string; at: string } | null
  }
  recentJobs: Array<{
    id: string
    domain: string
    type: string
    status: string
    message: string
    articlesCreated: number
    filesDeployed: number
    scheduledAt: string
    completedAt: string | null
  }>
}

export default function SchedulerPage() {
  const confirm = useConfirm()
  const [data, setData] = useState<SchedulerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [ticking, setTicking] = useState(false)
  const [activating, setActivating] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/scheduler")
      if (res.ok) setData(await res.json())
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh every 60s when running
  useEffect(() => {
    if (!data?.config.isRunning) return
    const timer = setInterval(() => fetchData(), 60_000)
    return () => clearInterval(timer)
  }, [data?.config.isRunning, fetchData])

  async function toggleScheduler() {
    if (!data) return
    const newState = !data.config.isRunning
    if (newState) {
      const ok = await confirm({
        title: "Mulai scheduler?",
        message:
          "Sistem akan otomatis:\n" +
          "1. Generate artikel (Claude AI)\n" +
          "2. Deploy ke server (FTP)\n" +
          "3. Purge cache (Cloudflare)\n" +
          "4. Submit ke IndexNow (Bing)\n" +
          "5. Sebar backlink (prioritas MS → MS 2 → LP → RTP → CN)\n" +
          "6. Cek milestone & kirim notifikasi\n\n" +
          "Semua berjalan di server, tanpa buka browser.",
        confirmText: "Ya, mulai",
      })
      if (!ok) return
    } else {
      const ok = await confirm({
        title: "⚠️ Hentikan scheduler?",
        message:
          "Semua domain akan BERHENTI auto-generate artikel + deploy.\n\n" +
          "Dampak:\n" +
          "• Nggak ada artikel baru yang ke-publish\n" +
          "• Nggak ada deploy otomatis\n" +
          "• Backlink nggak tersebar\n\n" +
          "Kamu bisa nyalain lagi kapan aja, tapi Google mungkin nge-notice kalau pattern publishing tiba-tiba berhenti.",
        confirmText: "Ya, hentikan",
        variant: "danger",
      })
      if (!ok) return
    }
    await fetch("/api/scheduler", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isRunning: newState }) })
    fetchData()
  }

  async function updateConfig(field: string, value: number | boolean) {
    await fetch("/api/scheduler", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: value }) })
    fetchData()
  }

  async function manualTick() {
    setTicking(true)
    try {
      const res = await fetch("/api/scheduler/tick", { method: "POST" })
      const result = await res.json()
      alert(`${result.generated ?? 0} artikel, ${result.deployed ?? 0} deploy, ${result.errors?.length ?? 0} error`)
      fetchData()
    } catch { alert("Gagal") }
    finally { setTicking(false) }
  }

  async function activateDomains(filter: string) {
    const label = filter === "deployed" ? "yang sudah di-deploy" : "tanpa artikel (setup awal)"
    const ok = await confirm({ message: `Aktifkan semua domain ${label} di scheduler?` })
    if (!ok) return
    setActivating(true)
    try {
      const res = await fetch("/api/scheduler/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "activate", filter }) })
      const result = await res.json()
      alert(result.message)
      fetchData()
    } catch { alert("Gagal") }
    finally { setActivating(false) }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  }

  if (loading) {
    return (
      <SidebarInset>
        <AppHeader title="Scheduler" />
        <div className="p-6 flex items-center justify-center" style={{ minHeight: "60vh" }}>
          <Loader2 className="size-8 animate-spin" style={{ color: "#0ea5e9" }} />
        </div>
      </SidebarInset>
    )
  }

  const cfg = data?.config
  const stats = data?.stats
  const isOn = cfg?.isRunning ?? false

  return (
    <SidebarInset>
      <AppHeader title="Scheduler" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>

        {/* ═══ Big Status Card ═══ */}
        <div className="rounded-2xl border p-6 mb-6 shadow-sm" style={{
          background: isOn
            ? "linear-gradient(135deg, rgba(16,185,129,0.06), rgba(14,165,233,0.06))"
            : "var(--card)",
          borderColor: isOn ? "rgba(16,185,129,0.25)" : "var(--border)",
        }}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{
                background: isOn ? "rgba(16,185,129,0.15)" : "rgba(100,116,139,0.1)",
              }}>
                <Clock className="size-7" style={{ color: isOn ? "#10b981" : "var(--muted-foreground)" }} />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>Scheduler</h2>
                  <Badge className={isOn ? "bg-emerald-500 text-white" : "bg-gray-400 text-white"}>
                    {isOn ? "RUNNING" : "STOPPED"}
                  </Badge>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9" }}>
                    Server-side
                  </span>
                </div>
                <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
                  {isOn
                    ? `Otomatis: generate → deploy → purge → IndexNow → sebar backlink (setiap 10 menit)`
                    : "Scheduler tidak aktif. Klik Start untuk memulai autopilot."}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }} onClick={fetchData}>
                <RefreshCw className="size-4 mr-1" /> Refresh
              </Button>
              <Button variant="outline" className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }} onClick={() => setShowSettings(!showSettings)}>
                <Settings2 className="size-4 mr-1" /> {showSettings ? "Tutup" : "Setting"}
              </Button>
              <Button
                className={`rounded-lg shadow-lg ${isOn ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"} text-white`}
                style={{ boxShadow: isOn ? "0 4px 14px rgba(239,68,68,0.3)" : "0 4px 14px rgba(16,185,129,0.3)" }}
                onClick={toggleScheduler}
              >
                {isOn ? <><Square className="size-4 mr-1" /> Stop</> : <><Play className="size-4 mr-1" /> Start</>}
              </Button>
            </div>
          </div>

          {/* Live stats row */}
          {stats && (
            <div className="grid grid-cols-5 gap-4">
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(14,165,233,0.1)" }}>
                <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{stats.activeDomains}</p>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>Domain Aktif</p>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(245,158,11,0.1)" }}>
                <p className="text-2xl font-bold text-amber-600">{stats.pendingJobs}</p>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>Pending</p>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(16,185,129,0.1)" }}>
                <p className="text-2xl font-bold text-emerald-600">{stats.todayGenerated}</p>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>Artikel Hari Ini</p>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(168,85,247,0.1)" }}>
                <p className="text-2xl font-bold" style={{ color: "#a855f7" }}>{stats.todayDeployed}</p>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>Deploy Hari Ini</p>
              </div>
              <div className="rounded-xl p-4 text-center" style={{ background: "rgba(148,163,184,0.08)", border: "1px solid rgba(14,165,233,0.1)" }}>
                <p className="text-sm font-bold truncate" style={{ color: "var(--foreground)" }}>{stats.nextScheduled?.domain ?? "—"}</p>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{stats.nextScheduled ? formatTime(stats.nextScheduled.at) : "Tidak ada"}</p>
              </div>
            </div>
          )}
        </div>

        {/* ═══ Settings (collapsible) ═══ */}
        {showSettings && (
          <div className="rounded-xl border p-6 mb-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--foreground)" }}>
              <Settings2 className="size-4" style={{ color: "var(--muted-foreground)" }} /> Pengaturan Scheduler
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <Label className="text-sm" style={{ color: "var(--secondary-foreground)" }}>Artikel per minggu per domain</Label>
                <div className="flex items-center gap-3 mt-2">
                  <input type="range" min="1" max="7" value={cfg?.articlesPerWeek || 4} onChange={(e) => updateConfig("articlesPerWeek", parseInt(e.target.value))} className="flex-1 h-2 rounded-lg appearance-none cursor-pointer" style={{ background: "var(--border)" }} />
                  <span className="font-bold w-8 text-center text-lg" style={{ color: "#0ea5e9" }}>{cfg?.articlesPerWeek}</span>
                </div>
              </div>
              <div>
                <Label className="text-sm" style={{ color: "var(--secondary-foreground)" }}>Artikel awal (domain baru)</Label>
                <div className="flex items-center gap-3 mt-2">
                  <input type="range" min="3" max="10" value={cfg?.initialArticles || 5} onChange={(e) => updateConfig("initialArticles", parseInt(e.target.value))} className="flex-1 h-2 rounded-lg appearance-none cursor-pointer" style={{ background: "var(--border)" }} />
                  <span className="font-bold w-8 text-center text-lg" style={{ color: "#0ea5e9" }}>{cfg?.initialArticles}</span>
                </div>
              </div>
              <div>
                <Label className="text-sm" style={{ color: "var(--secondary-foreground)" }}>Max domain per hari</Label>
                <div className="flex items-center gap-3 mt-2">
                  <input type="range" min="5" max="50" step="5" value={cfg?.maxDomainsPerDay || 15} onChange={(e) => updateConfig("maxDomainsPerDay", parseInt(e.target.value))} className="flex-1 h-2 rounded-lg appearance-none cursor-pointer" style={{ background: "var(--border)" }} />
                  <span className="font-bold w-8 text-center text-lg" style={{ color: "#0ea5e9" }}>{cfg?.maxDomainsPerDay}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6 mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
              <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>Jam aktif: {cfg?.timeWindowStart}:00 — {cfg?.timeWindowEnd}:00</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={cfg?.autoDeploy ?? true} onChange={(e) => updateConfig("autoDeploy", e.target.checked)} className="rounded" />
                <span className="text-sm" style={{ color: "var(--secondary-foreground)" }}>Auto deploy</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={cfg?.autoPurgeCache ?? true} onChange={(e) => updateConfig("autoPurgeCache", e.target.checked)} className="rounded" />
                <span className="text-sm" style={{ color: "var(--secondary-foreground)" }}>Auto purge cache</span>
              </label>
            </div>
          </div>
        )}

        {/* ═══ Quick Actions ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => activateDomains("deployed")}
            disabled={activating}
            className="rounded-xl border p-4 text-left transition-all duration-150 hover:translate-x-1"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
                {activating ? <Loader2 className="size-5 animate-spin text-emerald-500" /> : <Globe className="size-5 text-emerald-500" />}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>Aktifkan domain deployed</p>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>Tambahkan semua domain yang sudah di-deploy ke scheduler</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => activateDomains("empty")}
            disabled={activating}
            className="rounded-xl border p-4 text-left transition-all duration-150 hover:translate-x-1"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(245,158,11,0.15)" }}>
                {activating ? <Loader2 className="size-5 animate-spin text-amber-500" /> : <Zap className="size-5 text-amber-500" />}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>Aktifkan domain kosong</p>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>Domain tanpa artikel — akan di-setup tema + artikel dari awal</p>
              </div>
            </div>
          </button>

          <button
            onClick={manualTick}
            disabled={ticking}
            className="rounded-xl border p-4 text-left transition-all duration-150 hover:translate-x-1"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(14,165,233,0.15)" }}>
                {ticking ? <Loader2 className="size-5 animate-spin text-[#0ea5e9]" /> : <Play className="size-5 text-[#0ea5e9]" />}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>Manual tick</p>
                <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>Proses pending jobs sekarang (tanpa menunggu 10 menit)</p>
              </div>
            </div>
          </button>
        </div>

        {/* ═══ How it works (simple) ═══ */}
        <div className="rounded-xl border p-4 mb-6" style={{ background: "rgba(14,165,233,0.1)", borderColor: "#bae6fd" }}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: "#0369a1" }}>
            <span className="font-medium">Cara kerja:</span>
            <span>Aktifkan domain</span>
            <span style={{ color: "var(--muted-foreground)" }}>→</span>
            <span>Start scheduler</span>
            <span style={{ color: "var(--muted-foreground)" }}>→</span>
            <span>Generate artikel</span>
            <span style={{ color: "var(--muted-foreground)" }}>→</span>
            <span>Auto deploy</span>
            <span style={{ color: "var(--muted-foreground)" }}>→</span>
            <span>Purge + IndexNow</span>
            <span style={{ color: "var(--muted-foreground)" }}>→</span>
            <span style={{ color: "#ec4899", fontWeight: 600 }}>Sebar backlink (MS → CN)</span>
            <span style={{ color: "var(--muted-foreground)" }}>→</span>
            <span style={{ color: "#10b981", fontWeight: 600 }}>Notifikasi</span>
          </div>
          <p className="text-[11px] mt-2" style={{ color: "#0369a1", opacity: 0.7 }}>
            Setiap tick (10 menit), scheduler jalankan semua langkah di atas otomatis. Backlink mengikuti prioritas tipe dan cap harian 15/hari.
          </p>
        </div>

        {/* ═══ History ═══ */}
        {data?.recentJobs && data.recentJobs.length > 0 && (
          <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
              <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>History (20 terakhir)</h3>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--muted)" }}>
              {data.recentJobs.map((job) => (
                <div key={job.id} className="px-6 py-3 flex items-center gap-3 text-sm">
                  {job.status === "success" ? (
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                  ) : job.status === "running" ? (
                    <Loader2 className="size-4 text-blue-500 animate-spin shrink-0" />
                  ) : (
                    <XCircle className="size-4 text-red-500 shrink-0" />
                  )}
                  <span className="font-medium truncate flex-1" style={{ color: "var(--secondary-foreground)" }}>{job.domain}</span>
                  {job.articlesCreated > 0 && (
                    <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", borderColor: "transparent" }}>
                      {job.articlesCreated} artikel
                    </Badge>
                  )}
                  {job.filesDeployed > 0 && (
                    <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9", borderColor: "transparent" }}>
                      deployed
                    </Badge>
                  )}
                  <span className="text-xs whitespace-nowrap" style={{ color: "var(--muted-foreground)" }}>
                    {job.completedAt ? formatTime(job.completedAt) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SidebarInset>
  )
}
