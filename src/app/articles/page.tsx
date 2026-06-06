"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Pencil, Trash2, FileText, Sparkles, Search, ChevronLeft, ChevronRight } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { useConfirm } from "@/components/ui/confirm-modal"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

interface Domain {
  id: string
  name: string
  url: string
}

interface Article {
  id: string
  title: string
  slug: string
  status: string
  publishedAt: string | null
  createdAt: string
  authorName: string
  domain: Domain | null
  category: { id: string; name: string } | null
}

export default function ArticlesPage() {
  const confirm = useConfirm()
  const router = useRouter()
  const [articles, setArticles] = useState<Article[]>([])
  const [domains, setDomains] = useState<Domain[]>([])
  const [selectedDomainId, setSelectedDomainId] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const perPage = 100

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  // Debounce search input so we don't hammer the API on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // When the active filter changes, snap back to page 1 — otherwise the user
  // can be stranded on page 8 with 0 results.
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, selectedDomainId])

  const fetchArticles = useCallback(async (
    domainId: string,
    searchTerm: string,
    page: number,
  ) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (domainId) params.set("domainId", domainId)
      if (searchTerm) params.set("search", searchTerm)
      params.set("page", String(page))
      params.set("perPage", String(perPage))
      const res = await fetch(`/api/articles?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setArticles(Array.isArray(json) ? json : (json.data ?? []))
        setTotal(typeof json.total === "number" ? json.total : (Array.isArray(json) ? json.length : 0))
      }
    } catch (error) {
      console.error("Failed to fetch articles:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch("/api/domains")
      .then((res) => res.json())
      .then((data) => setDomains(Array.isArray(data) ? data : (data.data ?? [])))
      .catch(console.error)
  }, [])

  useEffect(() => {
    fetchArticles(selectedDomainId, debouncedSearch, currentPage)
  }, [selectedDomainId, debouncedSearch, currentPage, fetchArticles])

  async function handleDelete(id: string) {
    const ok = await confirm({ title: "Hapus Artikel", message: "Apakah Anda yakin ingin menghapus artikel ini?", variant: "danger", confirmText: "Hapus" })
    if (!ok) return
    try {
      const res = await fetch(`/api/articles/${id}`, { method: "DELETE" })
      if (res.ok) {
        setArticles((prev) => prev.filter((a) => a.id !== id))
        setTotal((t) => Math.max(0, t - 1))
      }
    } catch (error) {
      console.error("Failed to delete article:", error)
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "--"
    return new Date(dateStr).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  return (
    <SidebarInset>
      <AppHeader title="Artikel" />
      <div className="p-3 md:p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 md:mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl md:text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Artikel</h2>
            <Badge variant="secondary" className="border-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>{total}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="bg-gradient-to-r from-[#0ea5e9] to-[#8b5cf6] hover:from-[#0284c7] hover:to-[#7c3aed] text-white rounded-lg shadow-lg transition-all flex-1 sm:flex-initial"
              onClick={() => router.push("/articles/ai-generate")}
            >
              <Sparkles className="size-4 mr-1" />
              AI Generate
            </Button>
            <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20 transition-all flex-1 sm:flex-initial" onClick={() => router.push("/articles/new")}>
              <Plus className="size-4 mr-1" />
              Artikel Baru
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--muted-foreground)" }} />
            <Input
              placeholder="Cari judul, domain, kategori, penulis..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
              className="pl-10 rounded-lg"
              style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
            />
          </div>
          <Select
            value={selectedDomainId}
            onValueChange={(val) => { setSelectedDomainId(val === "__all__" ? "" : (val ?? "")); setCurrentPage(1) }}
          >
            <SelectTrigger className="w-full sm:w-[220px] rounded-lg" style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
              <SelectValue placeholder="Semua Domain" />
            </SelectTrigger>
            <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <SelectItem value="__all__">Semua Domain</SelectItem>
              {domains.map((domain) => (
                <SelectItem key={domain.id} value={domain.id}>
                  {domain.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" style={{ background: "var(--muted)" }} />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="size-12 mb-4" style={{ color: "rgba(14,165,233,0.3)" }} />
            <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Tidak ada artikel ditemukan</h3>
            <p className="mt-1 mb-4" style={{ color: "var(--muted-foreground)" }}>
              Mulai dengan membuat artikel pertama Anda
            </p>
            <div className="flex gap-2">
              <Button
                className="bg-gradient-to-r from-[#0ea5e9] to-[#8b5cf6] hover:from-[#0284c7] hover:to-[#7c3aed] text-white rounded-lg"
                onClick={() => router.push("/articles/ai-generate")}
              >
                <Sparkles className="size-4 mr-1" />
                AI Generate
              </Button>
              <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg" onClick={() => router.push("/articles/new")}>
                <Plus className="size-4 mr-1" />
                Artikel Baru
              </Button>
            </div>
          </div>
        ) : (
          <>
          {/* ─── Mobile card view (< md) ─── */}
          <div className="md:hidden space-y-2.5">
            {articles.map((article) => (
              <div
                key={article.id}
                className="rounded-lg border p-3"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => router.push(`/articles/${article.id}`)}
                      className="font-semibold text-sm text-left hover:underline line-clamp-2"
                      style={{ color: "var(--foreground)" }}
                    >
                      {article.title}
                    </button>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <Button variant="ghost" size="icon-sm" className="hover:bg-[rgba(14,165,233,0.1)]" style={{ color: "var(--muted-foreground)" }} onClick={() => router.push(`/articles/${article.id}`)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={() => handleDelete(article.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={
                      article.status === "published"
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25 text-[10px]"
                        : "bg-yellow-500/15 text-yellow-400 border-yellow-500/25 text-[10px]"
                    }
                  >
                    {article.status === "published" ? "Terbit" : "Draf"}
                  </Badge>
                  {article.category?.name && (
                    <Badge variant="outline" className="text-[10px] border-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                      {article.category.name}
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                  {article.domain ? (
                    <Link
                      href={`/domains/${article.domain.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate hover:underline"
                      style={{ color: "var(--primary)" }}
                    >
                      {article.domain.name}
                    </Link>
                  ) : (
                    <span className="truncate" style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                  <span className="shrink-0" style={{ color: "var(--muted-foreground)" }}>
                    {formatDate(article.publishedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* ─── Desktop table view (>= md) ─── */}
          <div className="hidden md:block rounded-xl border shadow-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <Table>
              <TableHeader>
                <TableRow className="border-b" style={{ borderColor: "var(--border)" }}>
                  <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Judul</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Domain</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Kategori</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Tanggal Terbit</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider text-right py-4" style={{ color: "var(--muted-foreground)" }}>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.map((article) => (
                  <TableRow key={article.id} className="transition-colors border-b" style={{ borderColor: "var(--border)" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(14,165,233,0.04)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <TableCell className="font-medium max-w-[300px] truncate py-4" style={{ color: "var(--secondary-foreground)" }}>
                      {article.title}
                    </TableCell>
                    <TableCell className="py-4">
                      {article.domain ? (
                        <Link
                          href={`/domains/${article.domain.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                          style={{ color: "var(--primary)" }}
                        >
                          {article.domain.name}
                        </Link>
                      ) : (
                        <span style={{ color: "var(--muted-foreground)" }}>--</span>
                      )}
                    </TableCell>
                    <TableCell className="py-4" style={{ color: "var(--muted-foreground)" }}>
                      {article.category?.name ?? "--"}
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge
                        variant="outline"
                        className={
                          article.status === "published"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                            : "bg-yellow-500/15 text-yellow-400 border-yellow-500/25"
                        }
                      >
                        {article.status === "published" ? "Terbit" : "Draf"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4" style={{ color: "var(--muted-foreground)" }}>
                      {formatDate(article.publishedAt)}
                    </TableCell>
                    <TableCell className="text-right py-4">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" className="hover:bg-[rgba(14,165,233,0.1)]" style={{ color: "var(--muted-foreground)" }} onClick={() => router.push(`/articles/${article.id}`)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => handleDelete(article.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-1 md:px-4 py-3 mt-3 md:mt-0 md:border-t rounded-lg md:rounded-none" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs md:text-sm" style={{ color: "var(--muted-foreground)" }}>
                Menampilkan {total === 0 ? 0 : (currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, total)} dari {total}
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
      </div>
    </SidebarInset>
  )
}
