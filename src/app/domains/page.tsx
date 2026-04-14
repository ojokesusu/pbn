"use client"

import { useEffect, useState } from "react"
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
  server: { id: string; name: string; host: string } | null
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

interface SiteCheckResult {
  domainId: string
  status: "ok" | "broken" | "error"
  message: string
}

export default function DomainsPage() {
  const router = useRouter()
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [domainToDelete, setDomainToDelete] = useState<Domain | null>(null)
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const perPage = 25

  // Site check state
  const [siteCheckResults, setSiteCheckResults] = useState<Record<string, SiteCheckResult>>({})
  const [siteChecking, setSiteChecking] = useState(false)

  // Filters
  const [deployFilter, setDeployFilter] = useState<DeployFilter>("")
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("")
  const [genreFilter, setGenreFilter] = useState("")
  const [contentFilter, setContentFilter] = useState<ContentFilter>("")

  const filtered = domains.filter((d) => {
    // Search
    if (search) {
      const q = search.toLowerCase()
      const matchSearch = d.name.toLowerCase().includes(q) || d.url.toLowerCase().includes(q) || d.genre?.toLowerCase().includes(q) || d.server?.name?.toLowerCase().includes(q) || d.server?.host?.toLowerCase().includes(q)
      if (!matchSearch) return false
    }
    // Deploy filter
    if (deployFilter === "deployed" && !d.lastDeployed) return false
    if (deployFilter === "not-deployed" && d.lastDeployed) return false
    // Health filter
    if (healthFilter === "alive" && !d.isAlive) return false
    if (healthFilter === "dead" && (d.isAlive || !d.lastChecked)) return false
    if (healthFilter === "unchecked" && d.lastChecked) return false
    // Genre filter
    if (genreFilter && d.genre !== genreFilter) return false
    // Content filter
    if (contentFilter === "has-articles" && d._count.articles === 0) return false
    if (contentFilter === "no-articles" && d._count.articles > 0) return false
    if (contentFilter === "wp-only" && d.contentSource !== "wordpress") return false
    if (contentFilter === "ai-only" && d.contentSource !== "ai") return false
    if (contentFilter === "mixed" && d.contentSource !== "mixed") return false
    return true
  })
  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  // Unique genres for filter
  const genres = [...new Set(domains.map((d) => d.genre).filter(Boolean))].sort()

  // Quick stats
  const stats = {
    total: domains.length,
    deployed: domains.filter((d) => d.lastDeployed).length,
    alive: domains.filter((d) => d.isAlive).length,
    dead: domains.filter((d) => !d.isAlive && d.lastChecked).length,
    withArticles: domains.filter((d) => d._count.articles > 0).length,
    wpOnly: domains.filter((d) => d.contentSource === "wordpress").length,
    aiOnly: domains.filter((d) => d.contentSource === "ai").length,
    mixed: domains.filter((d) => d.contentSource === "mixed").length,
  }

  const hasActiveFilters = deployFilter || healthFilter || genreFilter || contentFilter

  useEffect(() => {
    fetchDomains()
  }, [])

  async function fetchDomains() {
    try {
      const res = await fetch("/api/domains")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setDomains(data)
    } catch (error) {
      console.error("Failed to fetch domains:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!domainToDelete) return
    setDeleting(domainToDelete.id)
    try {
      const res = await fetch(`/api/domains/${domainToDelete.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete")
      setDomains((prev) => prev.filter((d) => d.id !== domainToDelete.id))
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
    setSearch("")
    setCurrentPage(1)
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
      <div className="flex-1 space-y-6 p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Domain</h2>
            <p style={{ color: "var(--muted-foreground)" }}>
              Kelola domain jaringan blog privat Anda.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="rounded-lg"
              style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
              onClick={handleSiteCheck}
              disabled={siteChecking}
            >
              {siteChecking ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Globe className="size-4 mr-1" />}
              {siteChecking ? "Mengecek..." : "Cek Situs"}
            </Button>
            <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20 transition-all" onClick={() => router.push("/domains/new")}>
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
              <Table>
                <TableHeader>
                  <TableRow className="border-b" style={{ borderColor: "var(--border)" }}>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Nama Domain</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>URL</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Server</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Genre</TableHead>
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
                    return (
                      <TableRow key={domain.id} className="transition-colors border-b" style={{ borderColor: "var(--border)" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(14,165,233,0.04)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                        <TableCell className="font-medium py-4" style={{ color: "var(--secondary-foreground)" }}>
                          <Link
                            href={`/domains/${domain.id}`}
                            className="hover:underline"
                            style={{ color: "var(--secondary-foreground)" }}
                          >
                            {domain.name}
                          </Link>
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
                              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{domain.server.name}</span>
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
