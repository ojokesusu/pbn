"use client"

import { useState } from "react"
import Link from "next/link"
import { Upload, CheckCircle2, AlertCircle, Loader2, Server, Globe, Link2, ArrowRight } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { useConfirm } from "@/components/ui/confirm-modal"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface ImportResults {
  servers: { total: number; imported: number; errors: string[] }
  domains: { total: number; imported: number; errors: string[] }
  backlinks: { total: number; imported: number; errors: string[] }
}

export default function ImportPage() {
  const confirm = useConfirm()
  const [loading, setLoading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<ImportResults | null>(null)
  const [results, setResults] = useState<ImportResults | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handlePreview() {
    setPreviewing(true)
    setError(null)
    setResults(null)
    try {
      const res = await fetch("/api/import/xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview" }),
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
    const ok = await confirm({ message: "Import semua data? Data lama yang sama akan di-skip." })
    if (!ok) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/import/xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import" }),
      })
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

  return (
    <SidebarInset>
      <AppHeader title="Import Data" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Import dari Excel</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Import data dari file <code className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: "var(--muted)" }}>imports/PBN Project.xlsx</code>
            </p>
          </div>
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
            disabled={previewing || loading}
          >
            {previewing ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Upload className="size-4 mr-1" />}
            {previewing ? "Scanning..." : "Scan File"}
          </Button>
          <Button
            className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20"
            onClick={handleImport}
            disabled={loading || !preview}
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
            <li><strong>1.</strong> Taruh file <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: "var(--muted)" }}>PBN Project.xlsx</code> di folder <code className="px-1.5 py-0.5 rounded text-xs" style={{ background: "var(--muted)" }}>imports/</code></li>
            <li><strong>2.</strong> File harus punya 3 sheet: <strong>Servers</strong>, <strong>Domains</strong>, <strong>Backlinks</strong></li>
            <li><strong>3.</strong> Klik <strong>Scan File</strong> untuk preview jumlah data</li>
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
      </div>
    </SidebarInset>
  )
}
