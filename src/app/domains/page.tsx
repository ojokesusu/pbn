"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Globe,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
} from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useConfirm } from "@/components/ui/confirm-modal"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

interface Domain {
  id: string
  name: string
  url: string
  genre: string
  status: string
  lastDeployed: string | null
  createdAt: string
  isAlive: boolean
  httpStatus: number
  hasWordPress: boolean
  wpPostCount: number
  lastChecked: string | null
  theme: { id: string; name: string; layoutName: string; isGenerated: boolean } | null
  server: { id: string; label: string; name: string; host: string } | null
  schedulerActive: boolean
  _count: { articles: number }
  wpArticles: number
  aiArticles: number
  contentSource: "wordpress" | "ai" | "mixed" | "none"
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: "Aktif",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  },
  inactive: {
    label: "Nonaktif",
    className: "bg-red-500/15 text-red-400 border-red-500/25",
  },
  error: {
    label: "Error",
    className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  },
}

type DeployFilter = "" | "deployed" | "not-deployed"
type HealthFilter = "" | "alive" | "dead" | "unchecked"
type ContentFilter = "" | "has-articles" | "no-articles" | "wp-only" | "ai-only" | "mixed"
type TemplateFilter = "" | "magazine" | "blog" | "berita" | "none"
type SchedulerFilter = "" | "active" | "inactive"

const templateConfig: Record<string, { label: string; bg: string; color: string }> = {
  magazine: { label: "Magazine", bg: "rgba(236,72,153,0.12)", color: "#ec4899" },
  blog: { label: "Blog", bg: "rgba(14,165,233,0.12)", color: "#0ea5e9" },
  berita: { label: "Berita", bg: "rgba(245,158,11,0.12)", color: "#f59e0b" },
}

interface SiteCheckResult {
  domainId: string
  status: "ok" | "broken" | "error"
  message: string
}

interface DomainStats {
  total: number
  deployed: number
  alive: number
  dead: number
  withArticles: number
  wpOnly: number
  aiOnly: number
  mixed: number
  magazine: number
  blog: number
  berita: number
  schedulerActive: number
  schedulerInactive: number
}

export default function DomainsPage() {
  const router = useRouter()
  const confirm = useConfirm()
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [domainToDelete, setDomainToDelete] = useState<Domain | null>(null)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<DomainStats>({
    total: 0, deployed: 0, alive: 0, dead: 0, withArticles: 0,
    wpOnly: 0, aiOnly: 0, mixed: 0,
    magazine: 0, blog: 0, berita: 0, schedulerActive: 0, schedulerInactive: 0,
  })
  const [genres, setGenres] = useState<string[]>([])
  const perPage = 100

  // Site check state
  const [siteCheckResults, setSiteCheckResults] = useState<Record<string, SiteCheckResult>>({})
  const [siteChecking, setSiteChecking] = useState(false)

  // Filters
  const [deployFilter, setDeployFilter] = useState<DeployFilter>("")
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("")
  const [genreFilter, setGenreFilter] = useState("")
  const [contentFilter, setContentFilter] = useState<ContentFilter>("")
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>("")
  const [schedulerFilter, setSchedulerFilter] = useState<SchedulerFilter>("")

  // Bulk selection for scheduler activation
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkActivating, setBulkActivating] = useState(false)

  // The visible list IS the current page — server already paginated + filtered.
  // We keep `paginated` and `filtered` aliases so the existing JSX below stays
  // unchanged.
  const filtered = domains
  const paginated = domains
  const totalPages = Math.max(1, Math.ceil(total / perPage))

  const hasActiveFilters = deployFilter || healthFilter || genreFilter || contentFilter || templateFilter || schedulerFilter

  // Debounce the search box so each keystroke doesn't fire an API call
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Snap back to page 1 whenever a filter or search changes — otherwise the
  // user can land on page 8 of empty results.
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, deployFilter, healthFilter, genreFilter, contentFilter, templateFilter, schedulerFilter])

  const fetchDomains = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set("search", debouncedSearch)
      if (deployFilter) params.set("deploy", deployFilter)
      if (healthFilter) params.set("health", healthFilter)
      if (genreFilter) params.set("genre", genreFilter)
      if (contentFilter) params.set("content", contentFilter)
      if (templateFilter) params.set("template", templateFilter)
      if (schedulerFilter) params.set("scheduler", schedulerFilter)
      params.set("page", String(currentPage))
      params.set("perPage", String(perPage))
      const res = await fetch(`/api/domains?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      // Backwards-compatibility: tolerate the old array-shaped response too,
      // in case a stale browser tab races a deploy.
      if (Array.isArray(json)) {
        setDomains(json)
        setTotal(json.length)
      } else {
        setDomains(json.data ?? [])
        setTotal(json.total ?? 0)
        if (json.stats) setStats(json.stats)
        if (Array.isArray(json.genres)) setGenres(json.genres)
      }
    } catch (error) {
      console.error("Failed to fetch domains:", error)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, deployFilter, healthFilter, genreFilter, contentFilter, templateFilter, schedulerFilter, currentPage])

  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  async function handleDelete() {
    if (!domainToDelete) return
    setDeleting(domainToDelete.id)
    try {
      const res = await fetch(`/api/domains/${domainToDelete.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete")
      setDomains((prev) => prev.filter((d) => d.id !== domainToDelete.id))
      setTotal((t) => Math.max(0, t - 1))
    } catch (error) {
      console.error("Failed to delete domain:", error)
    } finally {
      setDeleting(null)
      setDeleteDialogOpen(false)
      setDomainToDelete(null)
    }
  }

  function resetFilters() {
    setDeployFilter("")
    setHealthFilter("")
    setGenreFilter("")
    setContentFilter("")
    setTemplateFilter("")
    setSchedulerFilter("")
    setSearch("")
    setCurrentPage(1)
  }

  function toggleSelect(id: string) {
    // Block toggling for already-active domains — they can't be re-activated
    const domain = domains.find((d) => d.id === id)
    if (domain?.schedulerActive) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      // Only select INACTIVE visible domains (skip already-active)
      const selectableIds = paginated.filter((d) => !d.schedulerActive).map((d) => d.id)
      const allSelected = selectableIds.length > 0 && selectableIds.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allSelected) {
        for (const id of selectableIds) next.delete(id)
      } else {
        for (const id of selectableIds) next.add(id)
      }
      return next
    })
  }

  function selectAllInactive() {
    const inactiveIds = filtered.filter((d) => !d.schedulerActive).map((d) => d.id)
    setSelectedIds(new Set(inactiveIds))
  }

  async function bulkActivateScheduler() {
    if (selectedIds.size === 0) return

    // Defensive filter: drop anything that has become active since selection
    const selectedArr = Array.from(selectedIds)
    const targetDomains = domains.filter((d) => selectedIds.has(d.id))
    const inactiveToActivate = targetDomains.filter((d) => !d.schedulerActive).map((d) => d.id)
    const alreadyActive = targetDomains.length - inactiveToActivate.length

    if (inactiveToActivate.length === 0) {
      await confirm({
        title: "Semua sudah aktif",
        message: `${selectedArr.length} domain yang kamu pilih sudah aktif di scheduler. Nggak perlu aktifkan ulang.`,
        confirmText: "OK",
      })
      setSelectedIds(new Set())
      return
    }

    // PBN safety soft warning — recommend max 20/day
    const isOverRecommended = inactiveToActivate.length > 20
    const recommendationNote = isOverRecommended
      ? `\n\n⚠️ REKOMENDASI ANTI-SPAM: Maks 10-20 domain/hari supaya Google nggak deteksi pola burst. Kamu memilih ${inactiveToActivate.length} — boleh lanjut kalau memang butuh, tapi tolong spread beberapa hari kalau bisa.\n`
      : ""

    const skipNote = alreadyActive > 0 ? `\n(${alreadyActive} domain yg kamu pilih sudah aktif, akan di-skip)\n` : ""

    const ok = await confirm({
      title: `Aktifkan ${inactiveToActivate.length} domain?`,
      message:
        `${inactiveToActivate.length} domain akan didaftarkan ke scheduler dengan jadwal random.${skipNote}\n` +
        `Setelah aktif, scheduler akan otomatis:\n` +
        `• Generate artikel pertama (5 artikel backdated kalau belum ada)\n` +
        `• Deploy ke server\n` +
        `• Purge Cloudflare cache + IndexNow\n` +
        `• Sebar backlink dari pool\n` +
        `\nPertama kali jalan dalam 10-40 menit (di-stagger biar nggak overload).` +
        recommendationNote,
      confirmText: `Aktifkan ${inactiveToActivate.length} domain`,
    })
    if (!ok) return

    setBulkActivating(true)
    try {
      const res = await fetch("/api/scheduler/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", domainIds: inactiveToActivate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Gagal aktivasi")

      await confirm({
        title: "✓ Berhasil!",
        message: `${data.activated} domain udah aktif di scheduler. Bakal mulai jalan dalam beberapa menit ke depan.`,
        confirmText: "OK",
      })
      setSelectedIds(new Set())
      await fetchDomains()
    } catch (err) {
      await confirm({
        title: "✗ Gagal",
        message: err instanceof Error ? err.message : "Unknown error",
        confirmText: "OK",
      })
    } finally {
      setBulkActivating(false)
    }
  }

  async function handleSiteCheck() {
    setSiteChecking(true)
    try {
      const res = await fetch("/api/site-check", { method: "POST" })
      const data = await res.json()
      if (res.ok && data.results) {
        const map: Record<string, SiteCheckResult> = {}
        for (const r of data.results) {
          map[r.domainId] = { domainId: r.domainId, status: r.status, message: r.message }
        }
        setSiteCheckResults(map)
      }
    } catch {
      // silent
    } finally {
      setSiteChecking(false)
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Belum pernah"
    return new Date(dateStr).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <SidebarInset>
      <AppHeader title="Domain" />
      <div className="flex-1 space-y-4 md:space-y-6 p-3 md:p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Domain</h2>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Kelola domain jaringan blog privat Anda.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="rounded-lg flex-1 sm:flex-initial"
              style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
              onClick={handleSiteCheck}
              disabled={siteChecking}
            >
              {siteChecking ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Globe className="size-4 mr-1" />}
              {siteChecking ? "Mengecek..." : "Cek Situs"}
            </Button>
            <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20 transition-all flex-1 sm:flex-initial" onClick={() => router.push("/domains/new")}>
              <Plus className="h-4 w-4 mr-1" />
              Tambah Domain
            </Button>
          </div>
        </div>

        {/* Quick stat chips */}
        {!loading && domains.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { resetFilters() }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: !hasActiveFilters ? "#0ea5e9" : "var(--muted)", color: !hasActiveFilters ? "#ffffff" : "var(--muted-foreground)" }}>
              Semua ({stats.total})
            </button>
            <button onClick={() => { resetFilters(); setDeployFilter("deployed"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: deployFilter === "deployed" ? "#10b981" : "rgba(16,185,129,0.1)", color: deployFilter === "deployed" ? "#ffffff" : "#10b981" }}>
              Deployed ({stats.deployed})
            </button>
            <button onClick={() => { resetFilters(); setDeployFilter("not-deployed"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: deployFilter === "not-deployed" ? "#f59e0b" : "rgba(245,158,11,0.1)", color: deployFilter === "not-deployed" ? "#ffffff" : "#f59e0b" }}>
              Belum Deploy ({stats.total - stats.deployed})
            </button>
            <button onClick={() => { resetFilters(); setHealthFilter("alive"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: healthFilter === "alive" ? "#10b981" : "rgba(16,185,129,0.1)", color: healthFilter === "alive" ? "#ffffff" : "#10b981" }}>
              Alive ({stats.alive})
            </button>
            <button onClick={() => { resetFilters(); setHealthFilter("dead"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: healthFilter === "dead" ? "#ef4444" : "rgba(239,68,68,0.1)", color: healthFilter === "dead" ? "#ffffff" : "#ef4444" }}>
              Dead ({stats.dead})
            </button>
            <button onClick={() => { resetFilters(); setContentFilter("wp-only"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: contentFilter === "wp-only" ? "#a855f7" : "rgba(168,85,247,0.1)", color: contentFilter === "wp-only" ? "#ffffff" : "#a855f7" }}>
              WP Content ({stats.wpOnly})
            </button>
            <button onClick={() => { resetFilters(); setContentFilter("ai-only"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: contentFilter === "ai-only" ? "#0ea5e9" : "rgba(14,165,233,0.1)", color: contentFilter === "ai-only" ? "#ffffff" : "#0ea5e9" }}>
              AI Content ({stats.aiOnly})
            </button>
            {stats.mixed > 0 && (
              <button onClick={() => { resetFilters(); setContentFilter("mixed"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: contentFilter === "mixed" ? "#8b5cf6" : "rgba(168,85,247,0.1)", color: contentFilter === "mixed" ? "#ffffff" : "#8b5cf6" }}>
                Mixed ({stats.mixed})
              </button>
            )}
            <button onClick={() => { resetFilters(); setContentFilter("no-articles"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: contentFilter === "no-articles" ? "var(--muted-foreground)" : "var(--muted)", color: contentFilter === "no-articles" ? "#ffffff" : "var(--muted-foreground)" }}>
              Tanpa Artikel ({stats.total - stats.withArticles})
            </button>
            <div className="w-px h-6 self-center mx-1" style={{ background: "var(--border)" }} />
            <button onClick={() => { resetFilters(); setTemplateFilter("magazine"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: templateFilter === "magazine" ? "#ec4899" : "rgba(236,72,153,0.1)", color: templateFilter === "magazine" ? "#ffffff" : "#ec4899" }}>
              Magazine ({stats.magazine})
            </button>
            <button onClick={() => { resetFilters(); setTemplateFilter("blog"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: templateFilter === "blog" ? "#0ea5e9" : "rgba(14,165,233,0.1)", color: templateFilter === "blog" ? "#ffffff" : "#0ea5e9" }}>
              Blog ({stats.blog})
            </button>
            <button onClick={() => { resetFilters(); setTemplateFilter("berita"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: templateFilter === "berita" ? "#f59e0b" : "rgba(245,158,11,0.1)", color: templateFilter === "berita" ? "#ffffff" : "#f59e0b" }}>
              Berita ({stats.berita})
            </button>
            <div className="w-px h-6 self-center mx-1" style={{ background: "var(--border)" }} />
            <button onClick={() => { resetFilters(); setSchedulerFilter("active"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: schedulerFilter === "active" ? "#10b981" : "rgba(16,185,129,0.1)", color: schedulerFilter === "active" ? "#ffffff" : "#10b981" }}>
              Scheduler Aktif ({stats.schedulerActive})
            </button>
            <button onClick={() => { resetFilters(); setSchedulerFilter("inactive"); setCurrentPage(1) }} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ background: schedulerFilter === "inactive" ? "#ef4444" : "rgba(239,68,68,0.1)", color: schedulerFilter === "inactive" ? "#ffffff" : "#ef4444" }}>
              Belum Aktif ({stats.schedulerInactive})
            </button>
          </div>
        )}

        {/* Bulk action bar — appears when checkboxes selected */}
        {selectedIds.size > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border p-3 md:p-4 shadow-lg animate-in fade-in slide-in-from-top-2 md:flex-row md:items-center md:justify-between" style={{ background: "linear-gradient(135deg, rgba(14,165,233,0.1), rgba(132,204,22,0.1))", borderColor: "rgba(14,165,233,0.3)" }}>
            <div className="flex items-center gap-3">
              <div className="rounded-lg px-2.5 py-1 text-sm font-bold" style={{ background: "#0ea5e9", color: "#ffffff" }}>
                {selectedIds.size}
              </div>
              <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>domain dipilih</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs underline" style={{ color: "var(--muted-foreground)" }}>
                clear
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button variant="outline" size="sm" className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }} onClick={selectAllInactive}>
                Pilih semua belum aktif
              </Button>
              <Button onClick={bulkActivateScheduler} disabled={bulkActivating} className="rounded-lg" style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#ffffff" }}>
                {bulkActivating ? <><Loader2 className="size-4 mr-1 animate-spin" /> Mengaktifkan...</> : `Aktifkan ${selectedIds.size} domain`}
              </Button>
            </div>
          </div>
        )}

        <Card className="rounded-xl border shadow-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: "var(--foreground)" }}>
              <Globe className="size-5" style={{ color: "#0ea5e9" }} />
              Semua Domain
            </CardTitle>
            <CardDescription style={{ color: "var(--muted-foreground)" }}>
              {loading
                ? "Memuat domain..."
                : `${filtered.length} dari ${domains.length} domain`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!loading && domains.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-3 items-center">
                {/* Search */}
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--muted-foreground)" }} />
                  <Input
                    placeholder="Cari domain, URL, genre, server, IP..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                    className="pl-10 rounded-lg"
                    style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  />
                </div>

                {/* Deploy filter */}
                <select
                  value={deployFilter}
                  onChange={(e) => { setDeployFilter(e.target.value as DeployFilter); setCurrentPage(1) }}
                  className="h-9 rounded-lg border px-3 text-sm"
                  style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                >
                  <option value="">Deploy: Semua</option>
                  <option value="deployed">Sudah Deploy</option>
                  <option value="not-deployed">Belum Deploy</option>
                </select>

                {/* Health filter */}
                <select
                  value={healthFilter}
                  onChange={(e) => { setHealthFilter(e.target.value as HealthFilter); setCurrentPage(1) }}
                  className="h-9 rounded-lg border px-3 text-sm"
                  style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                >
                  <option value="">Health: Semua</option>
                  <option value="alive">Alive</option>
                  <option value="dead">Dead</option>
                  <option value="unchecked">Belum Dicek</option>
                </select>

                {/* Genre filter */}
                {genres.length > 0 && (
                  <select
                    value={genreFilter}
                    onChange={(e) => { setGenreFilter(e.target.value); setCurrentPage(1) }}
                    className="h-9 rounded-lg border px-3 text-sm"
                    style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  >
                    <option value="">Genre: Semua</option>
                    {genres.map((g) => (
                      <option key={g} value={g}>{g} ({domains.filter((d) => d.genre === g).length})</option>
                    ))}
                  </select>
                )}

                {/* Content filter */}
                <select
                  value={contentFilter}
                  onChange={(e) => { setContentFilter(e.target.value as ContentFilter); setCurrentPage(1) }}
                  className="h-9 rounded-lg border px-3 text-sm"
                  style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                >
                  <option value="">Konten: Semua</option>
                  <option value="has-articles">Punya Artikel</option>
                  <option value="no-articles">Tanpa Artikel</option>
                  <option value="wp-only">WordPress Only</option>
                  <option value="ai-only">AI Only</option>
                  <option value="mixed">Mixed (WP + AI)</option>
                </select>

                {/* Template filter */}
                <select
                  value={templateFilter}
                  onChange={(e) => { setTemplateFilter(e.target.value as TemplateFilter); setCurrentPage(1) }}
                  className="h-9 rounded-lg border px-3 text-sm"
                  style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                >
                  <option value="">Template: Semua</option>
                  <option value="magazine">Magazine ({stats.magazine})</option>
                  <option value="blog">Blog ({stats.blog})</option>
                  <option value="berita">Berita ({stats.berita})</option>
                  <option value="none">Tanpa Template</option>
                </select>

                {/* Reset */}
                {(hasActiveFilters || search) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg h-9"
                    style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                    onClick={resetFilters}
                  >
                    <X className="size-3 mr-1" />
                    Reset
                  </Button>
                )}
              </div>
            )}
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" style={{ background: "var(--muted)" }} />
                ))}
              </div>
            ) : domains.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Globe className="size-12" style={{ color: "rgba(14,165,233,0.3)" }} />
                <h3 className="mt-4 text-lg font-semibold" style={{ color: "var(--foreground)" }}>Belum ada domain</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Mulai dengan menambahkan domain pertama Anda.
                </p>
                <Button className="mt-4 bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg" onClick={() => router.push("/domains/new")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Tambah Domain
                </Button>
              </div>
            ) : (
              <>
              {/* ─── Mobile card view (< md) ─── */}
              <div className="md:hidden space-y-2.5">
                {paginated.map((domain) => {
                  const isSelected = selectedIds.has(domain.id)
                  const template = domain.theme?.layoutName && templateConfig[domain.theme.layoutName]
                  return (
                    <div
                      key={domain.id}
                      className="rounded-lg border p-3 transition-colors"
                      style={{
                        borderColor: "var(--border)",
                        background: isSelected ? "rgba(14,165,233,0.06)" : "var(--card)",
                      }}
                    >
                      {/* Row 1: checkbox + name + actions */}
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={domain.schedulerActive ? true : isSelected}
                          disabled={domain.schedulerActive}
                          onChange={() => toggleSelect(domain.id)}
                          className="mt-1 size-4 rounded accent-[#10b981] disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                          title={domain.schedulerActive ? "Sudah aktif di scheduler" : "Pilih untuk aktivasi"}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/domains/${domain.id}`}
                              className="font-semibold text-sm truncate hover:underline"
                              style={{ color: "var(--foreground)" }}
                            >
                              {domain.name}
                            </Link>
                            {domain.schedulerActive && (
                              <span
                                title="Aktif di scheduler"
                                className="size-1.5 rounded-full shrink-0"
                                style={{ background: "#10b981", boxShadow: "0 0 6px rgba(16,185,129,0.6)" }}
                              />
                            )}
                          </div>
                          <a
                            href={domain.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs hover:underline truncate max-w-full"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            <span className="truncate">{domain.url.replace(/^https?:\/\//, "")}</span>
                            <ExternalLink className="size-3 shrink-0" />
                          </a>
                        </div>
                        <div className="flex shrink-0 gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="hover:bg-[rgba(14,165,233,0.1)]"
                            style={{ color: "var(--muted-foreground)" }}
                            onClick={() => router.push(`/domains/${domain.id}`)}
                          >
                            <Pencil />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => {
                              setDomainToDelete(domain)
                              setDeleteDialogOpen(true)
                            }}
                          >
                            <Trash2 />
                            <span className="sr-only">Hapus</span>
                          </Button>
                        </div>
                      </div>

                      {/* Row 2: status badges */}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {domain.lastDeployed ? (
                          <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", borderColor: "transparent" }}>
                            Deployed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderColor: "transparent" }}>
                            Belum Deploy
                          </Badge>
                        )}
                        {domain.lastChecked && (
                          domain.isAlive ? (
                            <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", borderColor: "transparent" }}>
                              Alive
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", borderColor: "transparent" }}>
                              Dead
                            </Badge>
                          )
                        )}
                        {domain.contentSource === "wordpress" && (
                          <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", borderColor: "transparent" }}>WP</Badge>
                        )}
                        {domain.contentSource === "ai" && (
                          <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9", borderColor: "transparent" }}>AI</Badge>
                        )}
                        {domain.contentSource === "mixed" && (
                          <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6", borderColor: "transparent" }}>WP+AI</Badge>
                        )}
                        {template && (
                          <Badge variant="outline" className="border-0 text-[10px]" style={{ background: template.bg, color: template.color }}>
                            {template.label}
                          </Badge>
                        )}
                        {domain.genre && (
                          <Badge variant="outline" className="border-0 text-[10px]" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                            {domain.genre}
                          </Badge>
                        )}
                      </div>

                      {/* Row 3: meta info */}
                      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                        <div className="min-w-0 flex-1">
                          {domain.server ? (
                            <span className="font-mono truncate block" style={{ color: "var(--muted-foreground)" }}>
                              {domain.server.label || "—"}
                            </span>
                          ) : (
                            <span style={{ color: "var(--muted-foreground)" }}>Tanpa server</span>
                          )}
                        </div>
                        <span className="shrink-0" style={{ color: "var(--muted-foreground)" }}>
                          {domain._count.articles} artikel
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* ─── Desktop table view (>= md) ─── */}
              <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="border-b" style={{ borderColor: "var(--border)" }}>
                    <TableHead className="w-10 py-4">
                      <input
                        type="checkbox"
                        checked={
                          paginated.filter((d) => !d.schedulerActive).length > 0 &&
                          paginated.filter((d) => !d.schedulerActive).every((d) => selectedIds.has(d.id))
                        }
                        onChange={toggleSelectAllVisible}
                        className="size-4 rounded cursor-pointer accent-[#0ea5e9]"
                        title="Select semua yang BELUM aktif di scheduler"
                      />
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Nama Domain</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>URL</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Server</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Genre</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Template</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-center py-4" style={{ color: "var(--muted-foreground)" }}>Artikel</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Konten</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Health</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Deploy</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-right py-4" style={{ color: "var(--muted-foreground)" }}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((domain) => {
                    const status = statusConfig[domain.status] ?? statusConfig.inactive
                    const isSelected = selectedIds.has(domain.id)
                    return (
                      <TableRow key={domain.id} className="transition-colors border-b" style={{ borderColor: "var(--border)", background: isSelected ? "rgba(14,165,233,0.06)" : "transparent" }} onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(14,165,233,0.04)" }} onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent" }}>
                        <TableCell className="py-4">
                          <input
                            type="checkbox"
                            checked={domain.schedulerActive ? true : isSelected}
                            disabled={domain.schedulerActive}
                            onChange={() => toggleSelect(domain.id)}
                            className="size-4 rounded accent-[#10b981] disabled:opacity-60 disabled:cursor-not-allowed"
                            title={domain.schedulerActive ? "Sudah aktif di scheduler" : "Pilih untuk aktivasi"}
                            style={{ cursor: domain.schedulerActive ? "not-allowed" : "pointer" }}
                          />
                        </TableCell>
                        <TableCell className="font-medium py-4" style={{ color: "var(--secondary-foreground)" }}>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/domains/${domain.id}`}
                              className="hover:underline"
                              style={{ color: "var(--secondary-foreground)" }}
                            >
                              {domain.name}
                            </Link>
                            {domain.schedulerActive && (
                              <span title="Aktif di scheduler" className="size-1.5 rounded-full" style={{ background: "#10b981", boxShadow: "0 0 6px rgba(16,185,129,0.6)" }} />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4">
                          <a
                            href={domain.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {domain.url.replace(/^https?:\/\//, "")}
                            <ExternalLink className="size-3" />
                          </a>
                        </TableCell>
                        <TableCell className="py-4">
                          {domain.server ? (
                            <div>
                              <span className="text-xs font-mono" style={{ color: "var(--secondary-foreground)" }}>{domain.server.label || "—"}</span>
                              <span className="text-[10px] block font-mono" style={{ color: "var(--muted-foreground)" }}>{domain.server.host}</span>
                            </div>
                          ) : (
                            <span style={{ color: "var(--muted-foreground)" }}>—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          {domain.genre ? (
                            <Badge variant="outline" className="border-0 text-[11px]" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>{domain.genre}</Badge>
                          ) : (
                            <span style={{ color: "var(--muted-foreground)" }}>—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          {domain.theme?.layoutName && templateConfig[domain.theme.layoutName] ? (
                            <Badge variant="outline" className="border-0 text-[11px]" style={{ background: templateConfig[domain.theme.layoutName].bg, color: templateConfig[domain.theme.layoutName].color }}>
                              {templateConfig[domain.theme.layoutName].label}
                            </Badge>
                          ) : (
                            <span style={{ color: "var(--muted-foreground)" }}>—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center py-4" style={{ color: "var(--secondary-foreground)" }}>
                          {domain._count.articles}
                        </TableCell>
                        <TableCell className="py-4">
                          {domain.contentSource === "wordpress" ? (
                            <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", borderColor: "transparent" }}>WP</Badge>
                          ) : domain.contentSource === "ai" ? (
                            <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9", borderColor: "transparent" }}>AI</Badge>
                          ) : domain.contentSource === "mixed" ? (
                            <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(139,92,246,0.1)", color: "#8b5cf6", borderColor: "transparent" }}>WP+AI</Badge>
                          ) : (
                            <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>-</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          {!domain.lastChecked ? (
                            <span className="text-xs" style={{ color: "var(--border)" }}>—</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              {domain.isAlive ? (
                                <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", borderColor: "transparent" }}>
                                  Alive
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", borderColor: "transparent" }}>
                                  Dead
                                </Badge>
                              )}
                              {domain.hasWordPress && (
                                <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(168,85,247,0.1)", color: "#a855f7", borderColor: "transparent" }}>
                                  WP
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          {domain.lastDeployed ? (
                            <div className="flex items-center gap-1.5">
                              <div>
                                <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", borderColor: "transparent" }}>
                                  Deployed
                                </Badge>
                                <span className="text-[10px] block mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                                  {new Date(domain.lastDeployed).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
                                </span>
                              </div>
                              {siteCheckResults[domain.id] && (
                                siteCheckResults[domain.id].status === "ok" ? (
                                  <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", borderColor: "transparent" }} title="CSS & layout OK">
                                    CSS OK
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", borderColor: "transparent" }} title={siteCheckResults[domain.id].message}>
                                    {siteCheckResults[domain.id].status === "broken" ? "CSS Rusak" : "Error"}
                                  </Badge>
                                )
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", borderColor: "transparent" }}>
                              Belum
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right py-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="hover:bg-[rgba(14,165,233,0.1)]"
                              style={{ color: "var(--muted-foreground)" }}
                              onClick={() => router.push(`/domains/${domain.id}`)}
                            >
                              <Pencil />
                              <span className="sr-only">Edit</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => {
                                setDomainToDelete(domain)
                                setDeleteDialogOpen(true)
                              }}
                            >
                              <Trash2 />
                              <span className="sr-only">Hapus</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                    Menampilkan {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} dari {filtered.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                      <ChevronLeft className="size-4" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let page: number
                      if (totalPages <= 7) { page = i + 1 }
                      else if (currentPage <= 4) { page = i + 1 }
                      else if (currentPage >= totalPages - 3) { page = totalPages - 6 + i }
                      else { page = currentPage - 3 + i }
                      return (
                        <Button key={page} variant={currentPage === page ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(page)} className={`h-8 w-8 p-0 ${currentPage === page ? "bg-[#0ea5e9] text-white hover:bg-[#0284c7]" : ""}`} style={currentPage !== page ? { borderColor: "var(--border)", color: "var(--secondary-foreground)" } : {}}>
                          {page}
                        </Button>
                      )
                    })}
                    <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
            )}
          </CardContent>
        </Card>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="rounded-xl border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <DialogHeader>
              <DialogTitle style={{ color: "var(--foreground)" }}>Hapus Domain</DialogTitle>
              <DialogDescription style={{ color: "var(--muted-foreground)" }}>
                Apakah Anda yakin ingin menghapus{" "}
                <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                  {domainToDelete?.name}
                </span>
                ? Tindakan ini tidak dapat dibatalkan. Semua artikel dan log deploy
                yang terkait dengan domain ini juga akan dihapus.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" className="border-[color:var(--border)] hover:bg-[color:var(--muted)]" style={{ color: "var(--muted-foreground)" }} onClick={() => setDeleteDialogOpen(false)}>
                Batal
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting !== null}
              >
                {deleting ? (
                  <>
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                    Menghapus...
                  </>
                ) : (
                  "Hapus"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SidebarInset>
  )
}
