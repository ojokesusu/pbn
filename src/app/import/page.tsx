"use client"

import { useState, useRef } from "react"
import Link from "next/link"
import { Upload, CheckCircle2, AlertCircle, Loader2, Server, Globe, Link2, ArrowRight, ArrowRightLeft, FileSpreadsheet, X, BookOpen, Cloud } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { useConfirm } from "@/components/ui/confirm-modal"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BulkSwitchModal } from "@/components/bulk-switch-modal"
import { useMe } from "@/hooks/use-me"

interface ImportResults {
  servers: { total: number; imported: number; errors: string[] }
  domains: { total: number; imported: number; errors: string[] }
  backlinks: { total: number; imported: number; errors: string[] }
}

interface ArticleImportResults {
  imported: number
  skipped: number
  notFound: number
  errors: string[]
}

interface ArticlePreview {
  totalRows: number
  preview: { domain: string; title: string }[]
}

export default function ImportPage() {
  const confirm = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<ImportResults | null>(null)
  const [results, setResults] = useState<ImportResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bulkSwitchOpen, setBulkSwitchOpen] = useState(false)
  const { me } = useMe()
  const isAdmin = me?.role === "admin"

  // Articles import state
  const articleFileInputRef = useRef<HTMLInputElement>(null)
  const [articleFile, setArticleFile] = useState<File | null>(null)
  const [articleLoading, setArticleLoading] = useState(false)
  const [articlePreviewing, setArticlePreviewing] = useState(false)
  const [articlePreview, setArticlePreview] = useState<ArticlePreview | null>(null)
  const [articleResults, setArticleResults] = useState<ArticleImportResults | null>(null)
  const [articleError, setArticleError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
    setPreview(null)
    setResults(null)
    setError(null)
  }

  function clearFile() {
    setSelectedFile(null)
    setPreview(null)
    setResults(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handlePreview() {
    if (!selectedFile) {
      setError("Pilih file .xlsx terlebih dahulu")
      return
    }
    setPreviewing(true)
    setError(null)
    setResults(null)
    try {
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("action", "preview")
      const res = await fetch("/api/import/xlsx", { method: "POST", body: formData })
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
    if (!selectedFile) {
      setError("Pilih file .xlsx terlebih dahulu")
      return
    }
    const ok = await confirm({ message: "Import semua data? Data lama yang sama akan di-skip." })
    if (!ok) return
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", selectedFile)
      formData.append("action", "import")
      const res = await fetch("/api/import/xlsx", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Import gagal")
        return
      }
      setResults(data.results)
      setPreview(null)
    } catch {
      setError("Gagal terhubung ke server")
    } finally {
      setLoading(false)
    }
  }

  async function handleArticlePreview() {
    if (!articleFile) { setArticleError("Pilih file articles .xlsx terlebih dahulu"); return }
    setArticlePreviewing(true)
    setArticleError(null)
    setArticleResults(null)
    try {
      const res = await fetch("/api/import/articles", {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "x-action": "preview" },
        body: articleFile,
      })
      const data = await res.json()
      if (!res.ok) { setArticleError(data.error || "Preview gagal"); return }
      setArticlePreview(data)
    } catch { setArticleError("Gagal terhubung ke server") }
    finally { setArticlePreviewing(false) }
  }

  async function handleArticleImport() {
    if (!articleFile) { setArticleError("Pilih file articles .xlsx terlebih dahulu"); return }
    const ok = await confirm({ message: `Import ${articlePreview?.totalRows ?? "semua"} artikel? Artikel dengan slug yang sama akan di-update.` })
    if (!ok) return
    setArticleLoading(true)
    setArticleError(null)
    try {
      const res = await fetch("/api/import/articles", {
        method: "POST",
        headers: { "content-type": "application/octet-stream", "x-action": "import" },
        body: articleFile,
      })
      const data = await res.json()
      if (!res.ok) { setArticleError(data.error || "Import gagal"); return }
      setArticleResults(data)
      setArticlePreview(null)
    } catch { setArticleError("Gagal terhubung ke server") }
    finally { setArticleLoading(false) }
  }

  return (
    <SidebarInset>
      <AppHeader title="Import Data" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Import dari Excel</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Upload file <code className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: "var(--muted)" }}>.xlsx</code> langsung dari laptop kamu
            </p>
          </div>
        </div>

        {/* Bulk Switch Server + Cloudflare — featured for migration (admin only) */}
        {isAdmin && (
        <div
          className="rounded-xl border p-6 mb-6 shadow-sm relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(20,184,166,0.08), rgba(132,204,22,0.06))",
            borderColor: "rgba(20,184,166,0.3)",
          }}
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="flex items-center justify-center size-12 rounded-xl shrink-0" style={{ background: "rgba(20,184,166,0.15)" }}>
                <ArrowRightLeft className="size-6" style={{ color: "#14b8a6" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg" style={{ color: "var(--foreground)" }}>Bulk Switch Server + Cloudflare DNS</h3>
                  <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/25 text-[10px]">MIGRATION</Badge>
                </div>
                <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
                  Pindahkan banyak domain ke server baru sekaligus — DNS Cloudflare auto-update. Cocok buat migrasi SeekaHost ke Contabo/Hetzner.
                </p>
                <div className="flex items-center gap-3 mt-3 flex-wrap text-xs" style={{ color: "var(--secondary-foreground)" }}>
                  <span className="flex items-center gap-1">
                    <Server className="size-3.5" style={{ color: "#14b8a6" }} /> Pilih source & target server
                  </span>
                  <span className="flex items-center gap-1">
                    <Cloud className="size-3.5" style={{ color: "#14b8a6" }} /> Auto-sync CF A + CNAME www
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="size-3.5" style={{ color: "#14b8a6" }} /> Progress realtime + per-domain log
                  </span>
                </div>
              </div>
            </div>
            <Button
              className="rounded-lg shadow-lg text-white shrink-0"
              style={{
                background: "linear-gradient(135deg, #14b8a6, #0d9488)",
                boxShadow: "0 4px 14px rgba(20,184,166,0.35)",
              }}
              onClick={() => setBulkSwitchOpen(true)}
            >
              <ArrowRightLeft className="size-4 mr-1" />
              Mulai Bulk Switch
            </Button>
          </div>
        </div>
        )}

        {/* File Upload Zone */}
        <div
          className="rounded-xl border-2 border-dashed p-8 mb-6 text-center cursor-pointer transition-all"
          style={{
            borderColor: selectedFile ? "#0ea5e9" : "var(--border)",
            background: selectedFile ? "rgba(14,165,233,0.05)" : "var(--card)",
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleFileChange}
          />
          {selectedFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileSpreadsheet className="size-8 text-[#0ea5e9]" />
              <div className="text-left">
                <p className="font-semibold" style={{ color: "var(--foreground)" }}>{selectedFile.name}</p>
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); clearFile() }}
                className="ml-4 p-1 rounded-full hover:bg-red-100 transition-colors"
              >
                <X className="size-4 text-red-500" />
              </button>
            </div>
          ) : (
            <div>
              <Upload className="size-10 mx-auto mb-3" style={{ color: "var(--muted-foreground)" }} />
              <p className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>Klik untuk pilih file Excel</p>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Format: .xlsx — Max 10MB</p>
            </div>
          )}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center size-10 rounded-lg" style={{ background: "rgba(14,165,233,0.1)" }}>
                <Server className="size-5" style={{ color: "#0ea5e9" }} />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Sheet: Servers</p>
                <p className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
                  {results ? results.servers.imported : preview ? preview.servers.total : "—"}
                </p>
              </div>
            </div>
            {results && (
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/25">
                <CheckCircle2 className="size-3 mr-1" /> {results.servers.imported} imported
              </Badge>
            )}
          </div>

          <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center size-10 rounded-lg" style={{ background: "rgba(14,165,233,0.1)" }}>
                <Globe className="size-5" style={{ color: "#0ea5e9" }} />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Sheet: Domains</p>
                <p className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
                  {results ? results.domains.imported : preview ? preview.domains.total : "—"}
                </p>
              </div>
            </div>
            {results && (
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/25">
                <CheckCircle2 className="size-3 mr-1" /> {results.domains.imported} imported
              </Badge>
            )}
          </div>

          <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center justify-center size-10 rounded-lg" style={{ background: "rgba(14,165,233,0.1)" }}>
                <Link2 className="size-5" style={{ color: "#0ea5e9" }} />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Sheet: Backlinks</p>
                <p className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
                  {results ? results.backlinks.imported : preview ? preview.backlinks.total : "—"}
                </p>
              </div>
            </div>
            {results && (
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/25">
                <CheckCircle2 className="size-3 mr-1" /> {results.backlinks.imported} imported
              </Badge>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-6">
          <Button
            variant="outline"
            className="rounded-lg"
            style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
            onClick={handlePreview}
            disabled={previewing || loading || !selectedFile}
          >
            {previewing ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
            {previewing ? "Scanning..." : "Scan File"}
          </Button>
          <Button
            className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20"
            onClick={handleImport}
            disabled={loading || !preview || !selectedFile}
          >
            {loading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <CheckCircle2 className="size-4 mr-1" />}
            {loading ? "Importing..." : "Import Semua"}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border p-4 mb-6 flex items-start gap-3" style={{ background: "rgba(239,68,68,0.1)", borderColor: "#fecaca" }}>
            <AlertCircle className="size-5 mt-0.5 text-red-500" />
            <div>
              <p className="font-medium text-red-700">Error</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        )}

        {/* Success */}
        {results && (
          <div className="rounded-lg border p-4 mb-6 flex items-start gap-3" style={{ background: "rgba(16,185,129,0.1)", borderColor: "#bbf7d0" }}>
            <CheckCircle2 className="size-5 mt-0.5 text-emerald-500" />
            <div>
              <p className="font-medium text-emerald-700">Import Berhasil!</p>
              <p className="text-sm text-emerald-600">
                {results.servers.imported} server, {results.domains.imported} domain, {results.backlinks.imported} backlink berhasil diimport.
              </p>
              {(results.servers.errors.length > 0 || results.domains.errors.length > 0) && (
                <div className="mt-2 text-xs text-red-600">
                  {results.servers.errors.map((e, i) => <p key={`s${i}`}>{e}</p>)}
                  {results.domains.errors.map((e, i) => <p key={`d${i}`}>{e}</p>)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="rounded-xl border p-6 mb-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h3 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Cara Pakai</h3>
          <ol className="space-y-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
            <li><strong>1.</strong> Klik kotak upload di atas → pilih file <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: "var(--muted)" }}>.xlsx</code> dari laptop kamu</li>
            <li><strong>2.</strong> File harus punya 3 sheet: <strong>Servers</strong>, <strong>Domains</strong>, <strong>Backlinks</strong></li>
            <li><strong>3.</strong> Klik <strong>Scan File</strong> untuk preview jumlah data sebelum diimport</li>
            <li><strong>4.</strong> Klik <strong>Import Semua</strong> untuk memasukkan data ke database</li>
          </ol>
          <div className="mt-4 p-3 rounded-lg text-xs" style={{ background: "var(--background)", color: "var(--muted-foreground)" }}>
            <strong>Catatan:</strong> Nama domain & genre yang kosong atau bertuliskan &quot;AI Generate&quot; akan otomatis dibuat oleh sistem. Anchor text backlink yang kosong akan otomatis dipilih dari artikel saat distribusi.
          </div>
        </div>

        {/* WordPress Import Link */}
        <Link href="/import/wordpress">
          <div className="rounded-xl border p-6 shadow-sm transition-all hover:shadow-md hover:border-[#0ea5e9]/30 cursor-pointer" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center size-12 rounded-xl" style={{ background: "rgba(14,165,233,0.1)" }}>
                  <Globe className="size-6" style={{ color: "#0ea5e9" }} />
                </div>
                <div>
                  <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>Import dari WordPress</h3>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Scrape konten dari site WordPress via REST API</p>
                </div>
              </div>
              <ArrowRight className="size-5" style={{ color: "var(--muted-foreground)" }} />
            </div>
          </div>
        </Link>

        {/* ── Articles Import Section ────────────────────────────────────────── */}
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center size-10 rounded-xl" style={{ background: "rgba(249,115,22,0.1)" }}>
              <BookOpen className="size-5" style={{ color: "#f97316" }} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: "var(--foreground)" }}>Import Artikel</h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Upload file <code className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: "var(--muted)" }}>-articles-.xlsx</code> dari Domain Checker
              </p>
            </div>
          </div>

          {/* Article file upload */}
          <div
            className="rounded-xl border-2 border-dashed p-6 mb-4 text-center cursor-pointer transition-all"
            style={{
              borderColor: articleFile ? "#f97316" : "var(--border)",
              background: articleFile ? "rgba(249,115,22,0.05)" : "var(--card)",
            }}
            onClick={() => articleFileInputRef.current?.click()}
          >
            <input
              ref={articleFileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0] || null
                setArticleFile(f); setArticlePreview(null); setArticleResults(null); setArticleError(null)
              }}
            />
            {articleFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="size-7" style={{ color: "#f97316" }} />
                <div className="text-left">
                  <p className="font-semibold" style={{ color: "var(--foreground)" }}>{articleFile.name}</p>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{(articleFile.size / 1024).toFixed(1)} KB</p>
                </div>
                <button onClick={e => { e.stopPropagation(); setArticleFile(null); setArticlePreview(null); setArticleResults(null); setArticleError(null); if (articleFileInputRef.current) articleFileInputRef.current.value = "" }}
                  className="ml-4 p-1 rounded-full hover:bg-red-100 transition-colors">
                  <X className="size-4 text-red-500" />
                </button>
              </div>
            ) : (
              <div>
                <Upload className="size-8 mx-auto mb-2" style={{ color: "var(--muted-foreground)" }} />
                <p className="font-medium" style={{ color: "var(--foreground)" }}>Klik untuk pilih file articles .xlsx</p>
                <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
                  Export dari Domain Checker menggunakan tombol &quot;Export Articles&quot;
                </p>
              </div>
            )}
          </div>

          {/* Preview info */}
          {articlePreview && (
            <div className="rounded-lg border p-4 mb-4" style={{ background: "rgba(249,115,22,0.07)", borderColor: "rgba(249,115,22,0.3)" }}>
              <p className="font-semibold mb-2" style={{ color: "#f97316" }}>Preview: {articlePreview.totalRows} artikel ditemukan</p>
              <div className="space-y-1">
                {articlePreview.preview.map((p, i) => (
                  <div key={i} className="text-sm flex gap-2" style={{ color: "var(--muted-foreground)" }}>
                    <span className="font-mono text-xs shrink-0" style={{ color: "var(--foreground)", opacity: 0.6 }}>{p.domain}</span>
                    <span className="truncate">{p.title}</span>
                  </div>
                ))}
                {articlePreview.totalRows > 20 && (
                  <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>… dan {articlePreview.totalRows - 20} artikel lainnya</p>
                )}
              </div>
            </div>
          )}

          {/* Article error */}
          {articleError && (
            <div className="rounded-lg border p-4 mb-4 flex items-start gap-3" style={{ background: "rgba(239,68,68,0.1)", borderColor: "#fecaca" }}>
              <AlertCircle className="size-5 mt-0.5 text-red-500" />
              <p className="text-sm text-red-600">{articleError}</p>
            </div>
          )}

          {/* Article success */}
          {articleResults && (
            <div className="rounded-lg border p-4 mb-4 flex items-start gap-3" style={{ background: "rgba(16,185,129,0.1)", borderColor: "#bbf7d0" }}>
              <CheckCircle2 className="size-5 mt-0.5 text-emerald-500" />
              <div>
                <p className="font-medium text-emerald-700">Import Artikel Berhasil!</p>
                <p className="text-sm text-emerald-600">
                  {articleResults.imported} artikel diimport · {articleResults.skipped} dilewati · {articleResults.notFound} domain tidak ditemukan
                </p>
                {articleResults.notFound > 0 && (
                  <p className="text-xs mt-1 text-amber-600">
                    Domain tidak ditemukan = domain belum diimport ke PBN Dashboard. Import dulu via sheet Domains.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="rounded-lg"
              style={{ borderColor: "var(--border)" }}
              onClick={handleArticlePreview}
              disabled={articlePreviewing || articleLoading || !articleFile}
            >
              {articlePreviewing ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
              {articlePreviewing ? "Scanning..." : "Scan File"}
            </Button>
            <Button
              className="rounded-lg text-white"
              style={{ background: "#f97316", boxShadow: "0 2px 12px rgba(249,115,22,0.3)" }}
              onClick={handleArticleImport}
              disabled={articleLoading || !articlePreview || !articleFile}
            >
              {articleLoading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <CheckCircle2 className="size-4 mr-1" />}
              {articleLoading ? "Importing..." : `Import Artikel${articlePreview ? ` (${articlePreview.totalRows})` : ""}`}
            </Button>
          </div>
        </div>
      </div>

      {/* Bulk Switch modal (admin only) */}
      {isAdmin && <BulkSwitchModal open={bulkSwitchOpen} onClose={() => setBulkSwitchOpen(false)} />}
    </SidebarInset>
  )
}
