"use client"

import React, { useEffect, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2, Link2, Upload, Shuffle, Settings2, Search, ChevronLeft, ChevronRight, Loader2, CheckCircle2, Target, BarChart3, ExternalLink, FileText } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { useConfirm } from "@/components/ui/confirm-modal"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface BacklinkPlacement {
  id: string
  usedAnchor: string
  createdAt: string
  domain: { id: string; name: string; url: string } | null
  article: { id: string; title: string; slug: string } | null
}

interface Backlink {
  id: string
  anchorText: string
  targetUrl: string
  type: string
  status: string
  createdAt: string
  placements: BacklinkPlacement[]
}

interface DomainStat {
  id: string
  name: string
  url: string
  totalArticles: number
  backlinkPlacements: number
  maxSlots: number
  isFull: boolean
}

interface DistroStats {
  config: { maxPerDomain: number; maxPerArticle: number; percentArticles: number }
  stats: {
    totalBacklinks: number; totalPlacements: number; totalArticles: number
    targetArticles: number; articlesLinked: number; progressPercent: number
    dailyLimit: number; placedToday: number; remainingToday: number
  }
  domains: DomainStat[]
}

export default function BacklinksPage() {
  const confirm = useConfirm()
  const router = useRouter()
  const [backlinks, setBacklinks] = useState<Backlink[]>([])
  const [loading, setLoading] = useState(true)
  const [distributing, setDistributing] = useState(false)
  const [distributeResult, setDistributeResult] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [csvText, setCsvText] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [placementFilter, setPlacementFilter] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null)
  const perPage = 25

  // Distribution stats
  const [distroStats, setDistroStats] = useState<DistroStats | null>(null)
  const [tab, setTab] = useState<"backlinks" | "distribution">("backlinks")

  const types = [...new Set(backlinks.map(b => b.type).filter(Boolean))].sort()

  const filtered = backlinks.filter((b) => {
    if (typeFilter && b.type !== typeFilter) return false
    if (statusFilter && b.status !== statusFilter) return false
    if (placementFilter === "distributed" && b.placements.length === 0) return false
    if (placementFilter === "not-distributed" && b.placements.length > 0) return false
    if (!search) return true
    const q = search.toLowerCase()
    return b.anchorText?.toLowerCase().includes(q) || b.targetUrl.toLowerCase().includes(q) || b.type?.toLowerCase().includes(q)
  })
  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  // Group all placements by domain id — used by the Distribution tab expansion
  const placementsByDomain = useMemo(() => {
    const map = new Map<
      string,
      Array<{ backlink: Backlink; placement: BacklinkPlacement }>
    >()
    for (const bl of backlinks) {
      for (const p of bl.placements) {
        if (!p.domain) continue
        const arr = map.get(p.domain.id)
        if (arr) arr.push({ backlink: bl, placement: p })
        else map.set(p.domain.id, [{ backlink: bl, placement: p }])
      }
    }
    return map
  }, [backlinks])

  const fetchBacklinks = useCallback(async () => {
    setLoading(true)
    try {
      const [blRes, statsRes] = await Promise.all([
        fetch("/api/backlinks"),
        fetch("/api/backlinks/stats"),
      ])
      if (blRes.ok) setBacklinks(await blRes.json())
      if (statsRes.ok) setDistroStats(await statsRes.json())
    } catch (error) {
      console.error("Failed to fetch:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBacklinks() }, [fetchBacklinks])

  async function handleDelete(id: string) {
    const ok = await confirm({ title: "Hapus Backlink", message: "Hapus backlink ini?", variant: "danger", confirmText: "Hapus" })
    if (!ok) return
    try {
      const res = await fetch(`/api/backlinks/${id}`, { method: "DELETE" })
      if (res.ok) setBacklinks((prev) => prev.filter((b) => b.id !== id))
    } catch (error) { console.error("Failed to delete:", error) }
  }

  async function handleDistribute() {
    const remaining = distroStats?.stats.remainingToday ?? 0
    if (remaining <= 0) {
      alert("Batas harian tercapai! Coba lagi besok untuk menghindari spam.")
      return
    }
    const ok = await confirm({ message: `Distribusikan max ${remaining} backlink hari ini?\n\nPRIORITAS: MS → MS 2 → LP → RTP → CN (tipe prioritas tinggi dipasang lebih dulu).\nAnchor text: 60% branded, 30% naked URL, 10% keyword.\nTarget: ${distroStats?.config.percentArticles ?? 30}% artikel mendapat backlink.\n\nBatas harian: ${distroStats?.stats.dailyLimit ?? 15} backlink/hari.` })
    if (!ok) return
    setDistributing(true)
    setDistributeResult(null)
    try {
      const res = await fetch("/api/backlinks/distribute", { method: "POST" })
      const data = await res.json()
      setDistributeResult(`${data.placed ?? 0} backlink disisipkan ke artikel`)
      fetchBacklinks()
    } catch {
      setDistributeResult("Distribusi gagal")
    } finally {
      setDistributing(false)
    }
  }

  async function handleImport() {
    if (!csvText.trim()) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch("/api/backlinks/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText }),
      })
      const data = await res.json()
      if (res.ok) {
        setImportResult(`Berhasil import ${data.imported} backlink`)
        setCsvText("")
        fetchBacklinks()
      } else {
        setImportResult(data.error || "Import gagal")
      }
    } catch { setImportResult("Import gagal") }
    finally { setImporting(false) }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("id-ID", { year: "numeric", month: "short", day: "numeric" })
  }

  const ds = distroStats?.stats

  return (
    <SidebarInset>
      <AppHeader title="Backlink" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl" style={{ background: "rgba(236,72,153,0.1)" }}>
              <Link2 className="size-5" style={{ color: "#ec4899" }} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Backlink</h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Kelola target URL dan distribusi backlink ke artikel</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }} onClick={() => router.push("/backlinks/settings")}>
              <Settings2 className="size-4 mr-1" /> Pengaturan
            </Button>
            <Button variant="outline" className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }} onClick={() => setImportOpen(true)}>
              <Upload className="size-4 mr-1" /> Import CSV
            </Button>
            <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20" onClick={() => router.push("/backlinks/new")}>
              <Plus className="size-4 mr-1" /> Backlink Baru
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        {!loading && ds && (
          <div className="grid grid-cols-5 gap-4 mb-6">
            <div className="rounded-xl border p-4 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-1">
                <Link2 className="size-4" style={{ color: "#ec4899" }} />
                <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Backlink</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{ds.totalBacklinks}</p>
            </div>
            <div className="rounded-xl border p-4 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="size-4" style={{ color: "#0ea5e9" }} />
                <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Total Artikel</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{ds.totalArticles.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border p-4 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-1">
                <Target className="size-4" style={{ color: "#f59e0b" }} />
                <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Target ({distroStats?.config.percentArticles}%)</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "#f59e0b" }}>{ds.targetArticles}</p>
            </div>
            <div className="rounded-xl border p-4 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Sudah Link</p>
              </div>
              <p className="text-2xl font-bold text-emerald-600">{ds.articlesLinked}</p>
            </div>
            <div className="rounded-xl border p-4 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2 mb-1">
                <Shuffle className="size-4" style={{ color: "#a855f7" }} />
                <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Penempatan</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: "#a855f7" }}>{ds.totalPlacements}</p>
            </div>
          </div>
        )}

        {/* Progress bar + Distribute button + Daily limit */}
        {!loading && ds && (
          <div className="rounded-xl border p-5 mb-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Progress Distribusi</h3>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {ds.articlesLinked} dari {ds.targetArticles} artikel target ({ds.progressPercent}%)
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* Daily limit indicator */}
                <div className="text-right">
                  <p className="text-xs font-medium" style={{ color: ds.remainingToday > 0 ? "#10b981" : "#ef4444" }}>
                    {ds.remainingToday > 0 ? `${ds.remainingToday} tersisa hari ini` : "Batas harian tercapai"}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                    {ds.placedToday}/{ds.dailyLimit} per hari
                  </p>
                </div>
                <Button
                  className="rounded-lg shadow-lg"
                  style={{
                    background: ds.remainingToday > 0 ? "#ec4899" : "var(--muted-foreground)",
                    color: "#ffffff",
                    boxShadow: ds.remainingToday > 0 ? "0 4px 14px rgba(236,72,153,0.3)" : "none",
                    cursor: ds.remainingToday > 0 ? "pointer" : "not-allowed",
                  }}
                  onClick={handleDistribute}
                  disabled={distributing || ds.remainingToday <= 0}
                >
                  {distributing ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Shuffle className="size-4 mr-1" />}
                  {distributing ? "Distribusi..." : ds.remainingToday > 0 ? `Distribusi (max ${ds.remainingToday})` : "Besok"}
                </Button>
              </div>
            </div>
            {/* Overall progress */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>Target 30%</span>
                <span className="text-[10px] font-medium" style={{ color: ds.progressPercent >= 100 ? "#10b981" : "#ec4899" }}>{ds.progressPercent}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                <div className="h-full rounded-full" style={{ width: `${ds.progressPercent}%`, background: ds.progressPercent >= 100 ? "linear-gradient(90deg, #10b981, #34d399)" : "linear-gradient(90deg, #ec4899, #f472b6)", transition: "width 0.5s ease" }} />
              </div>
            </div>
            {/* Daily progress */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>Hari ini</span>
                <span className="text-[10px] font-medium" style={{ color: "#0ea5e9" }}>{ds.placedToday}/{ds.dailyLimit}</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (ds.placedToday / ds.dailyLimit) * 100)}%`, background: "linear-gradient(90deg, #0ea5e9, #0284c7)", transition: "width 0.5s ease" }} />
              </div>
            </div>
            {/* Priority + anti-spam info */}
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <div className="p-2.5 rounded-lg flex items-start gap-2" style={{ background: "rgba(236,72,153,0.1)", border: "1px solid rgba(236,72,153,0.25)" }}>
                <BarChart3 className="size-3.5 shrink-0 mt-0.5" style={{ color: "#ec4899" }} />
                <div className="text-[10px]" style={{ color: "var(--secondary-foreground)" }}>
                  <strong style={{ color: "#ec4899" }}>Prioritas tipe:</strong>{" "}
                  <span className="font-mono">MS</span> →{" "}
                  <span className="font-mono">MS 2</span> →{" "}
                  <span className="font-mono">LP</span> →{" "}
                  <span className="font-mono">RTP</span> →{" "}
                  <span className="font-mono">CN</span>
                  <div className="mt-0.5 opacity-75">Tipe prioritas tinggi selalu dipasang lebih dulu sampai habis.</div>
                </div>
              </div>
              <div className="p-2.5 rounded-lg flex items-start gap-2" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <Target className="size-3.5 shrink-0 mt-0.5" style={{ color: "#f59e0b" }} />
                <p className="text-[10px]" style={{ color: "var(--secondary-foreground)" }}>
                  <strong style={{ color: "#f59e0b" }}>Anti-spam:</strong> Max {ds.dailyLimit} backlink/hari. Anchor: 60% branded, 30% URL, 10% keyword.
                </p>
              </div>
            </div>
            {distributeResult && (
              <p className="text-xs mt-2 font-medium" style={{ color: "#10b981" }}>{distributeResult}</p>
            )}
          </div>
        )}

        {/* Tabs: Backlinks / Distribution Map */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab("backlinks")}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: tab === "backlinks" ? "#ec4899" : "var(--muted)", color: tab === "backlinks" ? "#ffffff" : "var(--muted-foreground)" }}
          >
            Daftar Backlink ({backlinks.length})
          </button>
          <button
            onClick={() => setTab("distribution")}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: tab === "distribution" ? "#a855f7" : "var(--muted)", color: tab === "distribution" ? "#ffffff" : "var(--muted-foreground)" }}
          >
            Distribusi per Domain ({distroStats?.domains.length ?? 0})
          </button>
        </div>

        {/* Tab: Backlinks Table */}
        {tab === "backlinks" && (
          <>
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" style={{ background: "var(--muted)" }} />)}</div>
            ) : backlinks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Link2 className="size-12 mb-4" style={{ color: "rgba(14,165,233,0.3)" }} />
                <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Belum ada backlink</h3>
                <p className="mt-1 mb-4" style={{ color: "var(--muted-foreground)" }}>Tambahkan backlink atau import dari CSV</p>
                <div className="flex gap-2">
                  <Button variant="outline" className="rounded-lg" style={{ borderColor: "var(--border)" }} onClick={() => setImportOpen(true)}>
                    <Upload className="size-4 mr-1" /> Import CSV
                  </Button>
                  <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg" onClick={() => router.push("/backlinks/new")}>
                    <Plus className="size-4 mr-1" /> Backlink Baru
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--muted-foreground)" }} />
                    <Input placeholder="Cari anchor text, URL, type..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }} className="pl-10 rounded-lg" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }} />
                  </div>
                  {types.length > 0 && (
                    <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1) }} className="h-9 rounded-lg border px-3 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                      <option value="">Type: Semua</option>
                      {types.map(t => <option key={t} value={t}>{t} ({backlinks.filter(b => b.type === t).length})</option>)}
                    </select>
                  )}
                  <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }} className="h-9 rounded-lg border px-3 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                    <option value="">Status: Semua</option>
                    <option value="active">Aktif ({backlinks.filter(b => b.status === "active").length})</option>
                    <option value="inactive">Nonaktif ({backlinks.filter(b => b.status === "inactive").length})</option>
                  </select>
                  <select value={placementFilter} onChange={(e) => { setPlacementFilter(e.target.value); setCurrentPage(1) }} className="h-9 rounded-lg border px-3 text-sm" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                    <option value="">Distribusi: Semua</option>
                    <option value="distributed">Sudah ({backlinks.filter(b => b.placements.length > 0).length})</option>
                    <option value="not-distributed">Belum ({backlinks.filter(b => b.placements.length === 0).length})</option>
                  </select>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{filtered.length} hasil</span>
                </div>
                <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b" style={{ borderColor: "var(--border)" }}>
                        <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Anchor Text</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Target URL</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Type</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Status</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-center py-4" style={{ color: "var(--muted-foreground)" }}>Penempatan</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider text-right py-4" style={{ color: "var(--muted-foreground)" }}>Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginated.map((bl) => (
                        <React.Fragment key={bl.id}>
                        <TableRow className="transition-colors border-b" style={{ borderColor: "var(--border)" }}>
                          <TableCell className="font-medium max-w-[200px] truncate py-3" style={{ color: "var(--secondary-foreground)" }}>
                            {bl.anchorText || <span className="flex items-center gap-1"><Badge variant="outline" className="text-[10px]" style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", borderColor: "transparent" }}>Auto</Badge><span style={{ color: "var(--muted-foreground)" }}>dari artikel</span></span>}
                          </TableCell>
                          <TableCell className="max-w-[250px] truncate py-3 text-xs" style={{ color: "var(--muted-foreground)" }}>{bl.targetUrl}</TableCell>
                          <TableCell className="py-3">
                            {bl.type ? <Badge variant="outline" className="text-[10px] font-semibold" style={{
                              background: bl.type === "MS" || bl.type === "MS 2" ? "rgba(239,68,68,0.1)" : bl.type === "LP" ? "rgba(14,165,233,0.1)" : bl.type === "CN" ? "rgba(168,85,247,0.1)" : bl.type === "RTP" ? "rgba(245,158,11,0.1)" : "rgba(100,116,139,0.1)",
                              color: bl.type === "MS" || bl.type === "MS 2" ? "#ef4444" : bl.type === "LP" ? "#0ea5e9" : bl.type === "CN" ? "#a855f7" : bl.type === "RTP" ? "#f59e0b" : "var(--muted-foreground)",
                              borderColor: "transparent",
                            }}>{bl.type}</Badge> : <span style={{ color: "var(--border)" }}>—</span>}
                          </TableCell>
                          <TableCell className="py-3">
                            <Badge variant="outline" className={bl.status === "active" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"}>
                              {bl.status === "active" ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center py-3">
                            {bl.placements.length > 0 ? (
                              <button
                                onClick={() => setExpandedRow(expandedRow === bl.id ? null : bl.id)}
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-all hover:scale-105"
                                style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}
                                title="Lihat daftar penempatan"
                              >
                                {bl.placements.length}
                                <ChevronRight className={`size-3 transition-transform ${expandedRow === bl.id ? "rotate-90" : ""}`} />
                              </button>
                            ) : (
                              <Badge variant="secondary" className="border-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                                0
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon-sm" className="hover:bg-[rgba(14,165,233,0.1)]" style={{ color: "var(--muted-foreground)" }} onClick={() => router.push(`/backlinks/${bl.id}`)}>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon-sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => handleDelete(bl.id)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedRow === bl.id && bl.placements.length > 0 && (
                          <TableRow style={{ background: "var(--muted)", borderColor: "var(--border)" }}>
                            <TableCell colSpan={6} className="p-0">
                              <div className="p-4 space-y-2">
                                <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                                  {bl.placements.length} Penempatan Aktif
                                </div>
                                {bl.placements.map((p) => {
                                  const articleUrl = p.domain && p.article
                                    ? `${p.domain.url.replace(/\/$/, "")}/articles/${p.article.slug}.html`
                                    : null
                                  const anchor = p.usedAnchor || bl.anchorText || ""
                                  return (
                                    <div
                                      key={p.id}
                                      className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                                      style={{ background: "var(--card)", borderColor: "var(--border)" }}
                                    >
                                      {/* Domain badge */}
                                      <div className="shrink-0 min-w-0 max-w-[160px]">
                                        <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#10b981" }}>
                                          {p.domain?.name || "—"}
                                        </div>
                                        <div className="text-[11px] truncate" style={{ color: "var(--muted-foreground)" }}>
                                          {p.article?.title || "—"}
                                        </div>
                                      </div>

                                      {/* Anchor */}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>
                                          Kata Backlink
                                        </div>
                                        <code className="px-2 py-1 rounded text-xs font-mono truncate inline-block max-w-full" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.2)" }}>
                                          &ldquo;{anchor}&rdquo;
                                        </code>
                                      </div>

                                      {/* Article link */}
                                      {articleUrl && (
                                        <a
                                          href={articleUrl}
                                          target="_blank"
                                          rel="noopener"
                                          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all hover:scale-105 hover:shadow-lg"
                                          style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#ffffff" }}
                                          title="Buka artikel di tab baru"
                                        >
                                          <ExternalLink className="size-3.5" />
                                          Buka Artikel
                                        </a>
                                      )}
                                    </div>
                                  )
                                })}
                                <div className="text-[10px] mt-2 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                                  💡 Klik <b>Buka Artikel</b> → tekan Ctrl+F → paste &ldquo;Kata Backlink&rdquo; → lihat linknya langsung di artikel.
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
                      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} dari {filtered.length}</p>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}><ChevronLeft className="size-4" /></Button>
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                          let page: number
                          if (totalPages <= 7) page = i + 1; else if (currentPage <= 4) page = i + 1; else if (currentPage >= totalPages - 3) page = totalPages - 6 + i; else page = currentPage - 3 + i
                          return <Button key={page} variant={currentPage === page ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(page)} className={`h-8 w-8 p-0 ${currentPage === page ? "bg-[#ec4899] text-white hover:bg-[#db2777]" : ""}`} style={currentPage !== page ? { borderColor: "var(--border)", color: "var(--secondary-foreground)" } : {}}>{page}</Button>
                        })}
                        <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}><ChevronRight className="size-4" /></Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* Tab: Distribution per Domain */}
        {tab === "distribution" && distroStats && (
          <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>Distribusi per Domain</h3>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Max {distroStats.config.maxPerDomain} backlink per domain, {distroStats.config.percentArticles}% artikel target</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ background: "var(--background)" }}>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Domain</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Artikel</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Backlink</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Slot</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Progress</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {distroStats.domains.map((d) => {
                    const percent = d.maxSlots > 0 ? Math.round((d.backlinkPlacements / d.maxSlots) * 100) : 0
                    const isExpanded = expandedDomain === d.id
                    const placements = placementsByDomain.get(d.id) || []
                    const canExpand = d.backlinkPlacements > 0 && placements.length > 0
                    return (
                      <React.Fragment key={d.id}>
                        <tr
                          className={`transition-colors ${canExpand ? "cursor-pointer hover:bg-[color:rgba(148,163,184,0.08)]" : ""}`}
                          onClick={() => canExpand && setExpandedDomain(isExpanded ? null : d.id)}
                        >
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              {canExpand && (
                                <ChevronRight
                                  className={`size-4 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                                  style={{ color: "var(--muted-foreground)" }}
                                />
                              )}
                              <div>
                                <a
                                  href={d.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium flex items-center gap-1"
                                  style={{ color: "#0ea5e9" }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {d.url.replace(/^https?:\/\//, "")}
                                  <ExternalLink className="size-3" />
                                </a>
                                <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{d.name}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-center" style={{ color: "var(--secondary-foreground)" }}>{d.totalArticles}</td>
                          <td className="px-6 py-3 text-center font-medium" style={{ color: "#a855f7" }}>{d.backlinkPlacements}</td>
                          <td className="px-6 py-3 text-center" style={{ color: "var(--muted-foreground)" }}>{d.backlinkPlacements}/{d.maxSlots}</td>
                          <td className="px-6 py-3">
                            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)", minWidth: 80 }}>
                              <div className="h-full rounded-full" style={{ width: `${percent}%`, background: d.isFull ? "#10b981" : "#ec4899", transition: "width 0.3s" }} />
                            </div>
                          </td>
                          <td className="px-6 py-3 text-center">
                            {d.isFull ? (
                              <Badge className="bg-emerald-100 text-emerald-700 text-[10px]"><CheckCircle2 className="size-3 mr-0.5" />Penuh</Badge>
                            ) : d.backlinkPlacements > 0 ? (
                              <Badge className="bg-amber-100 text-amber-700 text-[10px]">Sebagian</Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-500 text-[10px]">Kosong</Badge>
                            )}
                          </td>
                        </tr>

                        {isExpanded && canExpand && (
                          <tr style={{ background: "var(--muted)" }}>
                            <td colSpan={6} className="p-0">
                              <div className="p-4 space-y-2">
                                <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                                  {placements.length} Backlink Terpasang di {d.name}
                                </div>
                                {placements.map(({ backlink, placement }) => {
                                  const articleUrl = placement.article
                                    ? `${d.url.replace(/\/$/, "")}/articles/${placement.article.slug}.html`
                                    : null
                                  const anchor = placement.usedAnchor || backlink.anchorText || ""
                                  return (
                                    <div
                                      key={placement.id}
                                      className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
                                      style={{ background: "var(--card)", borderColor: "var(--border)" }}
                                    >
                                      {/* Article + target */}
                                      <div className="shrink-0 min-w-0 max-w-[220px]">
                                        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#10b981" }}>
                                          <FileText className="size-3" />
                                          Artikel
                                        </div>
                                        <div className="text-[12px] truncate" style={{ color: "var(--foreground)" }}>
                                          {placement.article?.title || "—"}
                                        </div>
                                        <div className="text-[10px] truncate" style={{ color: "var(--muted-foreground)" }}>
                                          → {backlink.targetUrl}
                                        </div>
                                      </div>

                                      {/* Anchor */}
                                      <div className="flex-1 min-w-0">
                                        <div className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color: "var(--muted-foreground)" }}>
                                          Kata Backlink
                                        </div>
                                        <code className="px-2 py-1 rounded text-xs font-mono truncate inline-block max-w-full" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.2)" }}>
                                          &ldquo;{anchor}&rdquo;
                                        </code>
                                      </div>

                                      {/* Open article */}
                                      {articleUrl && (
                                        <a
                                          href={articleUrl}
                                          target="_blank"
                                          rel="noopener"
                                          onClick={(e) => e.stopPropagation()}
                                          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all hover:scale-105 hover:shadow-lg"
                                          style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#ffffff" }}
                                          title="Buka artikel di tab baru"
                                        >
                                          <ExternalLink className="size-3.5" />
                                          Buka Artikel
                                        </a>
                                      )}
                                    </div>
                                  )
                                })}
                                <div className="text-[10px] mt-2 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                                  💡 Klik <b>Buka Artikel</b> → tekan Ctrl+F → paste &ldquo;Kata Backlink&rdquo; → lihat linknya langsung di artikel.
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import CSV Dialog */}
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <DialogHeader>
              <DialogTitle style={{ color: "var(--foreground)" }}>Import Backlink dari CSV</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label style={{ color: "var(--secondary-foreground)" }}>Format CSV</Label>
                <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                  Satu baris per backlink:
                  <code className="px-1 py-0.5 rounded text-xs ml-1" style={{ background: "var(--muted)" }}>anchor_text, target_url</code> atau
                  <code className="px-1 py-0.5 rounded text-xs ml-1" style={{ background: "var(--muted)" }}>target_url</code>
                </p>
              </div>
              <Textarea placeholder={"best seo tools, https://example.com/seo\nhttps://example.com/backlink"} value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={6} className="rounded-lg font-mono text-sm" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }} />
              {importResult && <p className="text-sm" style={{ color: importResult.startsWith("Berhasil") ? "#10b981" : "#ef4444" }}>{importResult}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" className="rounded-lg" style={{ borderColor: "var(--border)" }} onClick={() => setImportOpen(false)}>Batal</Button>
                <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg" onClick={handleImport} disabled={importing || !csvText.trim()}>
                  {importing ? "Mengimport..." : "Import"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </SidebarInset>
  )
}
