"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Search,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  RefreshCw,
  Globe,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-modal"

interface DomainIndex {
  id: string
  name: string
  url: string
  genre: string
  indexStatus: "unchecked" | "indexed" | "not-indexed"
  lastIndexCheck: string | null
  lastDeployed: string | null
}

interface Stats {
  total: number
  indexed: number
  notIndexed: number
  unchecked: number
}

type FilterTab = "" | "indexed" | "not-indexed" | "unchecked"

export default function IndexMonitorPage() {
  const confirm = useConfirm()
  const [domains, setDomains] = useState<DomainIndex[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterTab, setFilterTab] = useState<FilterTab>("")
  const [genreFilter, setGenreFilter] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [updating, setUpdating] = useState<string | null>(null)
  const [bulkChecking, setBulkChecking] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 })
  // Tracks which domains have already been opened in a Google tab this session,
  // so "Cek Google" can open the NEXT batch (RAM-friendly) and the operator can
  // bulk-mark only the ones actually checked.
  const [openedIds, setOpenedIds] = useState<Set<string>>(new Set())
  const BATCH_SIZE = 20
  const perPage = 25

  const loadData = useCallback(async () => {
    try {
      const res = await fetch("/api/index-monitor")
      const data = await res.json()
      if (res.ok) {
        setDomains(data.domains)
        setStats(data.stats)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  async function updateStatus(domainId: string, status: "indexed" | "not-indexed") {
    setUpdating(domainId)
    try {
      await fetch("/api/index-monitor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId, indexStatus: status }),
      })
      setDomains((prev) =>
        prev.map((d) =>
          d.id === domainId ? { ...d, indexStatus: status, lastIndexCheck: new Date().toISOString() } : d
        )
      )
      // Update stats
      if (stats) {
        const oldDomain = domains.find((d) => d.id === domainId)
        const oldStatus = oldDomain?.indexStatus || "unchecked"
        setStats({
          ...stats,
          [oldStatus === "not-indexed" ? "notIndexed" : oldStatus]: stats[oldStatus === "not-indexed" ? "notIndexed" : oldStatus as keyof Stats] as number - 1,
          [status === "not-indexed" ? "notIndexed" : status]: (stats[status === "not-indexed" ? "notIndexed" : status as keyof Stats] as number) + 1,
        })
      }
    } catch {
      // silent
    } finally {
      setUpdating(null)
    }
  }

  function openGoogleCheck(url: string) {
    const domain = url.replace(/^https?:\/\//, "").replace(/\/+$/, "")
    window.open(`https://www.google.com/search?q=site:${domain}`, "_blank")
  }

  // Bulk-set index status for all currently-filtered domains
  async function bulkSetStatus(status: "indexed" | "not-indexed" | "unchecked") {
    if (filtered.length === 0) {
      await confirm({
        title: "Tidak ada domain",
        message: "Tidak ada domain untuk ditandai dengan filter saat ini.",
        confirmText: "OK",
      })
      return
    }
    const labels: Record<string, string> = {
      "indexed": "Terindex",
      "not-indexed": "Belum Terindex",
      "unchecked": "Belum Dicek",
    }
    const ok = await confirm({
      title: `Tandai ${filtered.length} domain sebagai "${labels[status]}"?`,
      message:
        `Filter aktif akan menentukan domain mana yang diubah. Pastikan filter sudah benar sebelum konfirmasi.`,
      confirmText: "Tandai",
      variant: status === "not-indexed" ? "danger" : "default",
    })
    if (!ok) return

    try {
      const res = await fetch("/api/index-monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domainIds: filtered.map((d) => d.id),
          indexStatus: status,
        }),
      })
      if (!res.ok) {
        await confirm({ title: "Gagal update status", message: "Server menolak permintaan. Coba lagi.", confirmText: "OK" })
        return
      }
      await loadData()
    } catch {
      await confirm({ title: "Koneksi bermasalah", message: "Tidak bisa menghubungi server. Coba lagi.", confirmText: "OK" })
    }
  }

  // Mark every domain already opened via "Cek Google" (and still within the
  // current filter) as Terindex in one click — confirms a checked batch without
  // clicking the per-row green button. Only touches opened domains; the rest are
  // left untouched (unlike "Semua Terindex" which marks ALL filtered).
  async function markOpenedIndexed() {
    const targets = filtered.filter((d) => openedIds.has(d.id))
    if (targets.length === 0) {
      await confirm({
        title: "Belum ada yang dibuka",
        message: 'Buka domain dulu lewat tombol "Cek Google (20 berikutnya)", baru tandai yang sudah dicek sebagai Terindex.',
        confirmText: "OK",
      })
      return
    }
    const ok = await confirm({
      title: `Tandai ${targets.length} domain yang sudah dibuka sebagai "Terindex"?`,
      message: "Hanya domain yang sudah kamu buka di tab Google (dan sesuai filter) yang ditandai. Domain yang belum dibuka tidak tersentuh.",
      confirmText: "Tandai Terindex",
    })
    if (!ok) return
    const markedIds = targets.map((d) => d.id)
    try {
      const res = await fetch("/api/index-monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainIds: markedIds, indexStatus: "indexed" }),
      })
      if (!res.ok) {
        await confirm({ title: "Gagal update status", message: "Server menolak permintaan. Coba lagi.", confirmText: "OK" })
        return
      }
      // Drop the just-marked ids from the "opened" set so the "dibuka" counter
      // self-clears to this batch and the button can't re-mark them after a
      // filter switch (they're already indexed now).
      setOpenedIds((prev) => {
        const next = new Set(prev)
        for (const id of markedIds) next.delete(id)
        return next
      })
      await loadData()
    } catch {
      await confirm({ title: "Koneksi bermasalah", message: "Tidak bisa menghubungi server. Coba lagi.", confirmText: "OK" })
    }
  }

  // Open Google site: checks for the NEXT batch of up to BATCH_SIZE domains that
  // haven't been opened yet (respects current filters + search). Batched so the
  // browser doesn't choke on 100s of tabs at once — opening that many crashes
  // low-RAM machines. Click again for the next 20.
  async function checkNextBatch() {
    const targets = filtered.filter((d) => !openedIds.has(d.id)).slice(0, BATCH_SIZE)
    if (targets.length === 0) {
      await confirm({
        title: "Semua sudah dibuka",
        message: "Semua domain pada filter ini sudah dibuka di tab Google. Ganti filter, atau klik Reset untuk mulai dari awal.",
        confirmText: "OK",
      })
      return
    }

    setBulkChecking(true)
    setBulkProgress({ current: 0, total: targets.length })

    // Only count a domain as "opened" if the tab ACTUALLY opened. The 800ms gap
    // means tabs after the first lose the click's user-activation, so a popup
    // blocker silently swallows them. We intentionally DON'T pass "noopener"
    // here so window.open returns the WindowProxy (or null when blocked) — that
    // return value is the only reliable signal a tab really opened. Marking a
    // blocked-but-unseen domain as "dibuka" would let "Terindex (Dibuka)" write
    // indexStatus=indexed for domains the operator never actually looked at.
    const newlyOpened: string[] = []
    let blocked = 0
    for (let i = 0; i < targets.length; i++) {
      const d = targets[i]
      const domain = d.url.replace(/^https?:\/\//, "").replace(/\/+$/, "")
      const w = window.open(`https://www.google.com/search?q=site:${domain}`, "_blank")
      if (w) newlyOpened.push(d.id)
      else blocked++
      setBulkProgress({ current: i + 1, total: targets.length })
      // Small delay between opens — lets the browser manage tab creation and
      // keeps Google from flagging the burst as automated.
      if (i < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 800))
      }
    }

    setOpenedIds((prev) => {
      const next = new Set(prev)
      for (const id of newlyOpened) next.add(id)
      return next
    })
    setBulkChecking(false)

    // If the popup blocker swallowed tabs, only the ones that truly opened are
    // counted as "dibuka". Tell the operator so the count never silently lies.
    if (blocked > 0) {
      await confirm({
        title: `${blocked} tab diblokir popup blocker`,
        message: `Cuma ${newlyOpened.length} dari ${targets.length} tab yang kebuka. Izinkan pop-up untuk situs ini, lalu klik "Cek Google" lagi. Hanya domain yang benar-benar terbuka yang dihitung "sudah dibuka".`,
        confirmText: "OK",
      })
    }
  }

  function resetOpened() {
    setOpenedIds(new Set())
  }

  const filtered = domains.filter((d) => {
    if (filterTab && d.indexStatus !== filterTab) return false
    if (genreFilter && d.genre !== genreFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return d.name.toLowerCase().includes(q) || d.url.toLowerCase().includes(q) || d.genre.toLowerCase().includes(q)
    }
    return true
  })

  // How many of the currently-filtered domains have already been opened in a
  // Google tab this session (drives the batch button + "sudah dibuka" actions).
  const openedInFilter = filtered.reduce((n, d) => n + (openedIds.has(d.id) ? 1 : 0), 0)
  const remainingToOpen = filtered.length - openedInFilter

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)
  const genres = [...new Set(domains.map((d) => d.genre).filter(Boolean))].sort()

  return (
    <SidebarInset>
      <AppHeader title="Index Monitor" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl" style={{ background: "rgba(168,85,247,0.1)" }}>
              <Eye className="size-5" style={{ color: "#a855f7" }} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Index Monitor</h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Pantau domain mana yang sudah terindex Google</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Button
                onClick={checkNextBatch}
                disabled={bulkChecking || loading || remainingToOpen === 0}
                className="rounded-lg shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #a855f7, #7c3aed)",
                  color: "#ffffff",
                  border: "none",
                }}
                title={`Buka ${BATCH_SIZE} domain berikutnya yang belum dibuka (sesuai filter). Klik lagi untuk 20 berikutnya — supaya RAM tidak jebol.`}
              >
                {bulkChecking ? (
                  <>
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                    {bulkProgress.current}/{bulkProgress.total}
                  </>
                ) : (
                  <>
                    <Search className="size-4 mr-1.5" />
                    {remainingToOpen > 0
                      ? `Cek Google (${Math.min(BATCH_SIZE, remainingToOpen)} berikutnya)`
                      : filtered.length > 0
                        ? "Semua sudah dibuka"
                        : "Cek Google"}
                  </>
                )}
              </Button>
              {filtered.length > 0 && (
                <span
                  className="text-xs whitespace-nowrap"
                  style={{ color: "var(--muted-foreground)" }}
                  title="Sudah dibuka di tab Google / total sesuai filter"
                >
                  {openedInFilter}/{filtered.length} dibuka
                </span>
              )}
              {openedInFilter > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg h-8 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                  onClick={resetOpened}
                  disabled={bulkChecking}
                  title="Lupakan daftar 'sudah dibuka' dan mulai dari awal"
                >
                  Reset
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              className="rounded-lg"
              style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
              onClick={() => { setLoading(true); loadData() }}
              disabled={loading}
            >
              {loading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
              Refresh
            </Button>
          </div>
        </div>

        {/* Bulk tag bar — shown when there are filtered results */}
        {stats && filtered.length > 0 && (
          <div
            className="rounded-xl border p-3 mb-6 flex items-center justify-between gap-3 flex-wrap"
            style={{ background: "rgba(168,85,247,0.05)", borderColor: "rgba(168,85,247,0.2)" }}
          >
            <div className="text-xs flex items-center gap-2" style={{ color: "var(--secondary-foreground)" }}>
              <span className="font-semibold" style={{ color: "#a855f7" }}>Tandai Massal:</span>
              <span>Tandai <strong style={{ color: "#059669" }}>hanya yang sudah dibuka</strong> (Terindex Dibuka), atau <strong>semua {filtered.length}</strong> domain sesuai filter sekaligus.</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={markOpenedIndexed}
                disabled={loading || openedInFilter === 0}
                className="rounded-lg"
                style={{ background: "#059669", color: "#ffffff", border: "none" }}
                title="Tandai HANYA domain yang sudah dibuka di Google sebagai Terindex — aman, tidak menyentuh yang belum dicek"
              >
                <CheckCircle2 className="size-3.5 mr-1" />
                Terindex (Dibuka: {openedInFilter})
              </Button>
              <Button
                size="sm"
                onClick={() => bulkSetStatus("indexed")}
                disabled={loading || filtered.length === 0}
                className="rounded-lg"
                style={{ background: "#10b981", color: "#ffffff", border: "none" }}
                title="Tandai semua domain yang terlihat sebagai Terindex"
              >
                <CheckCircle2 className="size-3.5 mr-1" />
                Semua Terindex
              </Button>
              <Button
                size="sm"
                onClick={() => bulkSetStatus("not-indexed")}
                disabled={loading || filtered.length === 0}
                className="rounded-lg"
                style={{ background: "#ef4444", color: "#ffffff", border: "none" }}
                title="Tandai semua domain yang terlihat sebagai Belum Terindex"
              >
                <XCircle className="size-3.5 mr-1" />
                Semua Belum
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bulkSetStatus("unchecked")}
                disabled={loading || filtered.length === 0}
                className="rounded-lg"
                style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                title="Reset status ke Belum Dicek"
              >
                <HelpCircle className="size-3.5 mr-1" />
                Reset
              </Button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && !stats && (
          <div className="rounded-xl border p-12 text-center" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <Loader2 className="size-8 mx-auto animate-spin mb-3" style={{ color: "#a855f7" }} />
            <p style={{ color: "var(--muted-foreground)" }}>Memuat data...</p>
          </div>
        )}

        {stats && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <Globe className="size-5" style={{ color: "#0ea5e9" }} />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Total Deployed</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{stats.total}</p>
              </div>
              <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle2 className="size-5 text-emerald-500" />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Terindex</p>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{stats.indexed}</p>
              </div>
              <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <XCircle className="size-5 text-red-500" />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Belum Terindex</p>
                </div>
                <p className="text-2xl font-bold text-red-600">{stats.notIndexed}</p>
              </div>
              <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 mb-2">
                  <HelpCircle className="size-5" style={{ color: "#f59e0b" }} />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Belum Dicek</p>
                </div>
                <p className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{stats.unchecked}</p>
              </div>
            </div>

            {/* How to use */}
            <div className="rounded-xl border p-5 mb-6 shadow-sm" style={{ background: "rgba(168,85,247,0.1)", borderColor: "#e9d5ff" }}>
              <h3 className="font-semibold mb-2" style={{ color: "#7c3aed" }}>Cara Menggunakan</h3>
              <div className="grid grid-cols-3 gap-4 text-sm" style={{ color: "#6d28d9" }}>
                <div className="flex items-start gap-2">
                  <span className="flex items-center justify-center size-6 rounded-full bg-[#a855f7] text-white text-xs font-bold shrink-0">1</span>
                  <p>Klik <strong>&quot;Cek Google (20 berikutnya)&quot;</strong> untuk buka <code className="px-1 py-0.5 rounded text-xs bg-white/60">site:domain.com</code> 20 domain sekaligus — klik lagi untuk 20 berikutnya (biar RAM aman)</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="flex items-center justify-center size-6 rounded-full bg-[#a855f7] text-white text-xs font-bold shrink-0">2</span>
                  <p>Lihat hasil Google — jika ada hasil, domain sudah <strong>terindex</strong></p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="flex items-center justify-center size-6 rounded-full bg-[#a855f7] text-white text-xs font-bold shrink-0">3</span>
                  <p>Tandai hijau/merah per baris, atau klik <strong>&quot;Terindex (Dibuka)&quot;</strong> untuk tandai semua yang barusan dibuka sekaligus</p>
                </div>
              </div>
            </div>

            {/* Domain List */}
            <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              {/* Filter tabs */}
              <div className="px-6 py-3 border-b flex items-center gap-2" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
                <button onClick={() => { setFilterTab(""); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: filterTab === "" ? "#a855f7" : "transparent", color: filterTab === "" ? "#ffffff" : "var(--muted-foreground)" }}>
                  Semua ({stats.total})
                </button>
                <button onClick={() => { setFilterTab("indexed"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: filterTab === "indexed" ? "#10b981" : "rgba(16,185,129,0.1)", color: filterTab === "indexed" ? "#ffffff" : "#10b981" }}>
                  Terindex ({stats.indexed})
                </button>
                <button onClick={() => { setFilterTab("not-indexed"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: filterTab === "not-indexed" ? "#ef4444" : "rgba(239,68,68,0.1)", color: filterTab === "not-indexed" ? "#ffffff" : "#ef4444" }}>
                  Belum ({stats.notIndexed})
                </button>
                <button onClick={() => { setFilterTab("unchecked"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: filterTab === "unchecked" ? "#f59e0b" : "rgba(245,158,11,0.1)", color: filterTab === "unchecked" ? "#ffffff" : "#f59e0b" }}>
                  Belum Dicek ({stats.unchecked})
                </button>
              </div>

              {/* Search + genre */}
              <div className="px-6 py-4 border-b flex flex-wrap gap-3 items-center" style={{ borderColor: "var(--border)" }}>
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--muted-foreground)" }} />
                  <Input
                    placeholder="Cari domain..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                    className="pl-10 rounded-lg"
                    style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  />
                </div>
                {genres.length > 0 && (
                  <select
                    value={genreFilter}
                    onChange={(e) => { setGenreFilter(e.target.value); setCurrentPage(1) }}
                    className="h-9 rounded-lg border px-3 text-sm"
                    style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  >
                    <option value="">Genre: Semua</option>
                    {genres.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                )}
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{filtered.length} hasil</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ background: "var(--background)" }}>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Domain</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Genre</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Deploy</th>
                      <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Terakhir Dicek</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {paginated.map((d) => (
                      <tr key={d.id} className="hover:bg-[color:rgba(148,163,184,0.08)] transition-colors">
                        <td className="px-6 py-3">
                          <a href={d.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline flex items-center gap-1" style={{ color: "#0ea5e9" }}>
                            {d.url.replace(/^https?:\/\//, "")}
                            <ExternalLink className="size-3" />
                          </a>
                          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{d.name}</span>
                        </td>
                        <td className="px-6 py-3">
                          {d.genre ? (
                            <Badge variant="outline" className="text-[10px]" style={{ background: "var(--muted)", color: "var(--muted-foreground)", borderColor: "transparent" }}>{d.genre}</Badge>
                          ) : <span style={{ color: "var(--muted-foreground)" }}>-</span>}
                        </td>
                        <td className="px-6 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                          {d.lastDeployed ? new Date(d.lastDeployed).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "-"}
                        </td>
                        <td className="px-6 py-3 text-center">
                          {d.indexStatus === "indexed" ? (
                            <Badge className="bg-emerald-100 text-emerald-700">
                              <CheckCircle2 className="size-3 mr-1" />
                              Terindex
                            </Badge>
                          ) : d.indexStatus === "not-indexed" ? (
                            <Badge className="bg-red-100 text-red-700">
                              <XCircle className="size-3 mr-1" />
                              Belum
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700">
                              <HelpCircle className="size-3 mr-1" />
                              Belum Dicek
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>
                          {d.lastIndexCheck ? new Date(d.lastIndexCheck).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg h-7 text-xs"
                              style={{ borderColor: "var(--border)", color: "#a855f7" }}
                              onClick={() => openGoogleCheck(d.url)}
                            >
                              <Search className="size-3 mr-1" />
                              Cek Google
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg h-7 text-xs"
                              style={{ borderColor: "#d1fae5", color: "#10b981", background: d.indexStatus === "indexed" ? "#d1fae5" : "transparent" }}
                              onClick={() => updateStatus(d.id, "indexed")}
                              disabled={updating === d.id}
                            >
                              {updating === d.id ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg h-7 text-xs"
                              style={{ borderColor: "#fecaca", color: "#ef4444", background: d.indexStatus === "not-indexed" ? "#fecaca" : "transparent" }}
                              onClick={() => updateStatus(d.id, "not-indexed")}
                              disabled={updating === d.id}
                            >
                              {updating === d.id ? <Loader2 className="size-3 animate-spin" /> : <XCircle className="size-3" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {paginated.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center" style={{ color: "var(--muted-foreground)" }}>
                          Tidak ada domain yang cocok dengan filter.
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
                    Menampilkan {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, filtered.length)} dari {filtered.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                      <ChevronLeft className="size-4" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let page: number
                      if (totalPages <= 7) page = i + 1
                      else if (currentPage <= 4) page = i + 1
                      else if (currentPage >= totalPages - 3) page = totalPages - 6 + i
                      else page = currentPage - 3 + i
                      return (
                        <Button key={page} variant={currentPage === page ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(page)} className={`h-8 w-8 p-0 ${currentPage === page ? "bg-[#a855f7] text-white hover:bg-[#9333ea]" : ""}`} style={currentPage !== page ? { borderColor: "var(--border)", color: "var(--secondary-foreground)" } : {}}>
                          {page}
                        </Button>
                      )
                    })}
                    <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </SidebarInset>
  )
}
