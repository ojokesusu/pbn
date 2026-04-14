"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Globe, Search, Loader2, CheckCircle2, AlertCircle, FileText, FolderOpen, Tag, Zap } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { useConfirm } from "@/components/ui/confirm-modal"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface Domain {
  id: string
  name: string
  url: string
  genre: string
}

interface PreviewData {
  site: { name: string; description: string; url: string }
  stats: { posts: number; categories: number; tags: number }
  posts: Array<{
    title: string
    slug: string
    date: string
    categories: string[]
    featuredImage: string
    author: string
    excerpt: string
  }>
  categories: Array<{ name: string; slug: string; count: number }>
}

interface ImportResult {
  siteName: string
  imported: number
  skipped: number
  categories: number
  themeGenerated: boolean
  errors?: string[]
}

export default function WordPressImportPage() {
  const confirm = useConfirm()
  const [domains, setDomains] = useState<Domain[]>([])
  const [wpUrl, setWpUrl] = useState("")
  const [selectedDomain, setSelectedDomain] = useState("")
  const [previewing, setPreviewing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch("/api/domains")
      if (res.ok) {
        const data = await res.json()
        setDomains(data)
      }
    } catch (err) {
      console.error("Failed to fetch domains:", err)
    }
  }, [])

  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  async function handlePreview() {
    if (!wpUrl.trim()) return
    setPreviewing(true)
    setError(null)
    setPreview(null)
    setResult(null)
    try {
      const res = await fetch("/api/import/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wpUrl: wpUrl.trim(), action: "preview" }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Preview gagal")
        return
      }
      setPreview(data)
    } catch {
      setError("Gagal terhubung ke server")
    } finally {
      setPreviewing(false)
    }
  }

  async function handleImport() {
    if (!selectedDomain) {
      setError("Pilih domain tujuan terlebih dahulu")
      return
    }
    const ok = await confirm({ message: "Import semua artikel dari WordPress ke domain yang dipilih?" })
    if (!ok) return
    setImporting(true)
    setError(null)
    try {
      const res = await fetch("/api/import/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wpUrl: wpUrl.trim(), domainId: selectedDomain, action: "import" }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Import gagal")
        return
      }
      setResult(data.results)
      setPreview(null)
    } catch {
      setError("Gagal terhubung ke server")
    } finally {
      setImporting(false)
    }
  }

  // Auto-match domain by URL
  function autoMatchDomain() {
    if (!preview || !preview.site.url) return
    const siteHost = preview.site.url.replace(/https?:\/\//, "").replace(/\/$/, "").toLowerCase()
    const match = domains.find(d => {
      const domainHost = d.url.replace(/https?:\/\//, "").replace(/\/$/, "").toLowerCase()
      return domainHost === siteHost
    })
    if (match) setSelectedDomain(match.id)
  }

  return (
    <SidebarInset>
      <AppHeader title="WordPress Import" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Bulk Import Banner */}
        <Link href="/import/wordpress/bulk">
          <div className="rounded-xl border p-5 mb-6 shadow-sm transition-all hover:shadow-md cursor-pointer" style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)", borderColor: "transparent" }}>
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center size-12 rounded-xl bg-white/20">
                  <Zap className="size-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Bulk Import → 294 WordPress Sites Sekaligus</h3>
                  <p className="text-sm opacity-90">Auto pick artikel terbaik + auto theme + skip duplikat</p>
                </div>
              </div>
              <span className="text-2xl">→</span>
            </div>
          </div>
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Import dari WordPress</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Scrape konten dari site WordPress melalui REST API. Permalink, kategori, dan gambar dipertahankan.
          </p>
        </div>

        {/* URL Input */}
        <div className="rounded-xl border p-6 mb-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <Label className="text-sm font-medium" style={{ color: "var(--secondary-foreground)" }}>WordPress Site URL</Label>
          <div className="flex gap-3 mt-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--muted-foreground)" }} />
              <Input
                placeholder="https://example.com"
                value={wpUrl}
                onChange={(e) => setWpUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePreview()}
                className="pl-10 rounded-lg"
                style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
              />
            </div>
            <Button
              variant="outline"
              className="rounded-lg"
              style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
              onClick={handlePreview}
              disabled={previewing || !wpUrl.trim()}
            >
              {previewing ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Search className="size-4 mr-1" />}
              {previewing ? "Scanning..." : "Scan"}
            </Button>
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
            Site harus aktif dan WordPress REST API tidak diblokir
          </p>
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

        {/* Preview Results */}
        {preview && (
          <div className="space-y-6">
            {/* Site Info + Stats */}
            <div className="rounded-xl border p-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold" style={{ color: "var(--foreground)" }}>{preview.site.name}</h3>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{preview.site.description || preview.site.url}</p>
                </div>
                <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/25">
                  <CheckCircle2 className="size-3 mr-1" /> REST API Aktif
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg p-4" style={{ background: "var(--background)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="size-4" style={{ color: "#0ea5e9" }} />
                    <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Artikel</span>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{preview.stats.posts}</p>
                </div>
                <div className="rounded-lg p-4" style={{ background: "var(--background)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <FolderOpen className="size-4" style={{ color: "#0ea5e9" }} />
                    <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Kategori</span>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{preview.stats.categories}</p>
                </div>
                <div className="rounded-lg p-4" style={{ background: "var(--background)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="size-4" style={{ color: "#0ea5e9" }} />
                    <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Tag</span>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{preview.stats.tags}</p>
                </div>
              </div>
            </div>

            {/* Post Preview Table */}
            <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
                <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>Preview Artikel (10 pertama)</h3>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {preview.posts.map((post, i) => (
                  <div key={i} className="px-6 py-3 flex items-center gap-4">
                    {post.featuredImage ? (
                      <img src={post.featuredImage} alt="" className="size-12 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="size-12 rounded-lg shrink-0 flex items-center justify-center" style={{ background: "var(--muted)" }}>
                        <FileText className="size-5" style={{ color: "var(--border)" }} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: "var(--secondary-foreground)" }}>{post.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{post.author}</span>
                        <span className="text-xs" style={{ color: "var(--border)" }}>|</span>
                        <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{new Date(post.date).toLocaleDateString("id-ID")}</span>
                        {post.categories[0] && (
                          <>
                            <span className="text-xs" style={{ color: "var(--border)" }}>|</span>
                            <Badge variant="outline" className="text-[10px] h-4" style={{ color: "var(--muted-foreground)", borderColor: "var(--border)" }}>
                              {post.categories[0]}
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                    <code className="text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>/{post.slug}/</code>
                  </div>
                ))}
              </div>
            </div>

            {/* Domain Selection + Import */}
            <div className="rounded-xl border p-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <h3 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Import ke Domain</h3>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Label className="text-sm" style={{ color: "var(--muted-foreground)" }}>Pilih domain tujuan</Label>
                  <select
                    value={selectedDomain}
                    onChange={(e) => setSelectedDomain(e.target.value)}
                    className="w-full h-9 rounded-lg border px-3 text-sm mt-1"
                    style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  >
                    <option value="">-- Pilih domain --</option>
                    {domains.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.url.replace(/https?:\/\//, "")})</option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  onClick={autoMatchDomain}
                >
                  Auto Match
                </Button>
                <Button
                  className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20"
                  onClick={handleImport}
                  disabled={importing || !selectedDomain}
                >
                  {importing ? <Loader2 className="size-4 mr-1 animate-spin" /> : <CheckCircle2 className="size-4 mr-1" />}
                  {importing ? "Importing..." : `Import ${preview.stats.posts} Artikel`}
                </Button>
              </div>
              <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
                Tema unik akan otomatis di-generate jika domain belum punya tema. Artikel yang slug-nya sudah ada akan di-skip.
              </p>
            </div>
          </div>
        )}

        {/* Import Results */}
        {result && (
          <div className="rounded-xl border p-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-start gap-3 mb-4">
              <CheckCircle2 className="size-6 text-emerald-500 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-emerald-700">Import Berhasil!</h3>
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Dari {result.siteName}</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="rounded-lg p-3 text-center" style={{ background: "rgba(16,185,129,0.1)" }}>
                <p className="text-2xl font-bold text-emerald-600">{result.imported}</p>
                <p className="text-xs text-emerald-500">Artikel diimport</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--background)" }}>
                <p className="text-2xl font-bold" style={{ color: "var(--muted-foreground)" }}>{result.skipped}</p>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Di-skip (duplikat)</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "var(--background)" }}>
                <p className="text-2xl font-bold" style={{ color: "var(--muted-foreground)" }}>{result.categories}</p>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Kategori</p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: result.themeGenerated ? "#eff6ff" : "var(--background)" }}>
                <p className="text-2xl font-bold" style={{ color: result.themeGenerated ? "#3b82f6" : "var(--muted-foreground)" }}>
                  {result.themeGenerated ? "Ya" : "—"}
                </p>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Tema baru</p>
              </div>
            </div>

            {result.errors && result.errors.length > 0 && (
              <div className="rounded-lg p-3 text-xs" style={{ background: "rgba(239,68,68,0.1)" }}>
                <p className="font-medium text-red-700 mb-1">Errors:</p>
                {result.errors.map((e, i) => (
                  <p key={i} className="text-red-600">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Instructions when empty */}
        {!preview && !result && !error && (
          <div className="rounded-xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <h3 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Cara Pakai</h3>
            <ol className="space-y-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
              <li><strong>1.</strong> Masukkan URL WordPress site (contoh: https://example.com)</li>
              <li><strong>2.</strong> Klik <strong>Scan</strong> untuk melihat preview konten</li>
              <li><strong>3.</strong> Pilih domain tujuan (atau klik Auto Match jika domain sama)</li>
              <li><strong>4.</strong> Klik <strong>Import</strong> untuk memasukkan semua artikel</li>
            </ol>
            <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: "var(--background)", color: "var(--muted-foreground)" }}>
              <strong>Yang diimport:</strong> Semua post (artikel), kategori, tag, featured image, author name, permalink (slug). Tema unik otomatis di-generate.
            </div>
          </div>
        )}
      </div>
    </SidebarInset>
  )
}
