"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  ShieldAlert,
  Loader2,
  ExternalLink,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Skeleton } from "@/components/ui/skeleton"

interface AdultDomain {
  id: string
  name: string
  url: string
  status: string
  isAdult: boolean
  adultDetectedAt: string | null
  createdAt: string
  // adultPatterns isn't in the schema yet — the field is reserved for the
  // detector pipeline. Render "—" until the detector starts writing it.
  adultPatterns?: string[] | null
}

interface AdultStats {
  adult: number
}

export default function AdultDomainsPage() {
  const confirm = useConfirm()
  const [domains, setDomains] = useState<AdultDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<AdultStats>({ adult: 0 })
  const perPage = 100

  const totalPages = Math.max(1, Math.ceil(total / perPage))

  const fetchDomains = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set("isAdult", "true")
      params.set("page", String(currentPage))
      params.set("perPage", String(perPage))
      const res = await fetch(`/api/domains?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      // Paginated response: { data, total, stats, ... }. We tolerate the
      // legacy array shape only as a defensive fallback in case a stale
      // build serves the old route.
      if (Array.isArray(json)) {
        setDomains(json as AdultDomain[])
        setTotal(json.length)
      } else {
        setDomains((json.data ?? []) as AdultDomain[])
        setTotal(json.total ?? 0)
        if (json.stats) setStats({ adult: json.stats.adult ?? json.total ?? 0 })
      }
    } catch (error) {
      console.error("Failed to fetch adult domains:", error)
    } finally {
      setLoading(false)
    }
  }, [currentPage])

  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  async function handleUnflag(domain: AdultDomain) {
    const ok = await confirm({
      title: "Lepas flag adult?",
      message:
        `${domain.name} akan dikembalikan ke pool legit. Domain ini akan kembali masuk ` +
        `scheduler & deploy normal. Pastikan kamu sudah verifikasi ini bukan adult content.`,
      confirmText: "Ya, unflag",
    })
    if (!ok) return

    setBusyId(domain.id)
    try {
      const res = await fetch(`/api/domains/${domain.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdult: false }),
      })
      if (!res.ok) throw new Error("Gagal unflag")
      // Optimistic remove — page already excludes non-adult rows server-side
      setDomains((prev) => prev.filter((d) => d.id !== domain.id))
      setTotal((t) => Math.max(0, t - 1))
      setStats((s) => ({ adult: Math.max(0, s.adult - 1) }))
    } catch (err) {
      await confirm({
        title: "Gagal",
        message: err instanceof Error ? err.message : "Unknown error",
        confirmText: "OK",
      })
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(domain: AdultDomain) {
    const ok = await confirm({
      title: "Hapus domain permanen?",
      message:
        `${domain.name} akan dihapus dari database TOTAL. Semua artikel, log deploy, ` +
        `dan record terkait juga hilang. Aksi ini TIDAK BISA di-undo. Pakai "Unflag" ` +
        `kalau cuma mau kembalikan ke pool legit.`,
      confirmText: "Hapus permanen",
      variant: "danger",
    })
    if (!ok) return

    setBusyId(domain.id)
    try {
      const res = await fetch(`/api/domains/${domain.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Gagal hapus")
      setDomains((prev) => prev.filter((d) => d.id !== domain.id))
      setTotal((t) => Math.max(0, t - 1))
      setStats((s) => ({ adult: Math.max(0, s.adult - 1) }))
    } catch (err) {
      await confirm({
        title: "Gagal",
        message: err instanceof Error ? err.message : "Unknown error",
        confirmText: "OK",
      })
    } finally {
      setBusyId(null)
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "—"
    return new Date(dateStr).toLocaleString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <SidebarInset>
      <AppHeader title="Adult Domains" />
      <div
        className="flex-1 space-y-4 md:space-y-6 p-3 md:p-6"
        style={{ background: "var(--background)", minHeight: "100vh" }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              className="text-xl md:text-2xl font-extrabold tracking-tight flex items-center gap-2"
              style={{ color: "var(--foreground)" }}
            >
              <ShieldAlert className="size-6" style={{ color: "#ef4444" }} />
              Adult Domains
              <Badge
                variant="outline"
                className="ml-1 border-0 text-xs font-bold"
                style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
              >
                {stats.adult} quarantined
              </Badge>
            </h2>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Domain salah beli yang sudah di-flag adult. Di-quarantine dari scheduler & deploy.
            </p>
          </div>
          <Link
            href="/domains"
            className="text-sm underline self-start sm:self-center"
            style={{ color: "var(--muted-foreground)" }}
          >
            ← Kembali ke daftar domain
          </Link>
        </div>

        {/* Warning banner */}
        <div
          className="rounded-xl border p-4 flex gap-3"
          style={{
            background: "rgba(239,68,68,0.08)",
            borderColor: "rgba(239,68,68,0.25)",
          }}
        >
          <AlertTriangle className="size-5 shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
          <div className="text-sm" style={{ color: "var(--foreground)" }}>
            <strong>Domain berikut salah beli</strong> — di-quarantine dari scheduler & deploy.
            Content kosong, record kept. Pakai <em>Unflag</em> kalau ternyata aman, atau{" "}
            <em>Delete</em> kalau yakin mau hapus permanen.
          </div>
        </div>

        <Card
          className="rounded-xl border shadow-lg"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <CardHeader>
            <CardTitle
              className="flex items-center gap-2"
              style={{ color: "var(--foreground)" }}
            >
              <ShieldAlert className="size-5" style={{ color: "#ef4444" }} />
              Quarantined
            </CardTitle>
            <CardDescription style={{ color: "var(--muted-foreground)" }}>
              {loading
                ? "Memuat domain..."
                : `${domains.length} dari ${total} domain ke-flag`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-12 w-full"
                    style={{ background: "var(--muted)" }}
                  />
                ))}
              </div>
            ) : domains.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShieldAlert
                  className="size-12"
                  style={{ color: "rgba(239,68,68,0.3)" }}
                />
                <h3
                  className="mt-4 text-lg font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  Belum ada adult domain ke-flag
                </h3>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Pool kamu bersih. Detector adult akan flag otomatis kalau menemukan match.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="md:hidden space-y-2.5">
                  {domains.map((domain) => (
                    <div
                      key={domain.id}
                      className="rounded-lg border p-3"
                      style={{
                        borderColor: "var(--border)",
                        background: "var(--card)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div
                            className="font-semibold text-sm truncate"
                            style={{ color: "var(--foreground)" }}
                          >
                            {domain.name}
                          </div>
                          <a
                            href={domain.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs hover:underline truncate max-w-full"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            <span className="truncate">
                              {domain.url.replace(/^https?:\/\//, "")}
                            </span>
                            <ExternalLink className="size-3 shrink-0" />
                          </a>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
                        <div style={{ color: "var(--muted-foreground)" }}>
                          Detected: {formatDate(domain.adultDetectedAt)}
                        </div>
                        <div style={{ color: "var(--muted-foreground)" }}>
                          Status: {domain.status}
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg flex-1"
                          style={{
                            borderColor: "var(--border)",
                            color: "var(--secondary-foreground)",
                          }}
                          onClick={() => handleUnflag(domain)}
                          disabled={busyId === domain.id}
                        >
                          {busyId === domain.id ? (
                            <Loader2 className="size-3 mr-1 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3 mr-1" />
                          )}
                          Unflag
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="rounded-lg flex-1"
                          onClick={() => handleDelete(domain)}
                          disabled={busyId === domain.id}
                        >
                          <Trash2 className="size-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table view */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow
                        className="border-b"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <TableHead
                          className="text-xs uppercase tracking-wider py-4"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          URL
                        </TableHead>
                        <TableHead
                          className="text-xs uppercase tracking-wider py-4"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Nama
                        </TableHead>
                        <TableHead
                          className="text-xs uppercase tracking-wider py-4"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Detected at
                        </TableHead>
                        <TableHead
                          className="text-xs uppercase tracking-wider py-4"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Patterns matched
                        </TableHead>
                        <TableHead
                          className="text-xs uppercase tracking-wider py-4"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Status
                        </TableHead>
                        <TableHead
                          className="text-xs uppercase tracking-wider text-right py-4"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Aksi
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {domains.map((domain) => {
                        const patterns = domain.adultPatterns ?? []
                        return (
                          <TableRow
                            key={domain.id}
                            className="border-b transition-colors"
                            style={{ borderColor: "var(--border)" }}
                          >
                            <TableCell className="py-4">
                              <a
                                href={domain.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:underline"
                                style={{ color: "var(--secondary-foreground)" }}
                              >
                                {domain.url.replace(/^https?:\/\//, "")}
                                <ExternalLink className="size-3" />
                              </a>
                            </TableCell>
                            <TableCell
                              className="py-4 font-medium"
                              style={{ color: "var(--foreground)" }}
                            >
                              {domain.name}
                            </TableCell>
                            <TableCell
                              className="py-4 text-xs"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              {formatDate(domain.adultDetectedAt)}
                            </TableCell>
                            <TableCell className="py-4">
                              {patterns.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {patterns.slice(0, 3).map((p) => (
                                    <Badge
                                      key={p}
                                      variant="outline"
                                      className="text-[10px] border-0"
                                      style={{
                                        background: "rgba(239,68,68,0.12)",
                                        color: "#ef4444",
                                      }}
                                    >
                                      {p}
                                    </Badge>
                                  ))}
                                  {patterns.length > 3 && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] border-0"
                                      style={{
                                        background: "var(--muted)",
                                        color: "var(--muted-foreground)",
                                      }}
                                    >
                                      +{patterns.length - 3}
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <span
                                  className="text-xs"
                                  style={{ color: "var(--muted-foreground)" }}
                                >
                                  —
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-4">
                              <Badge
                                variant="outline"
                                className="text-[10px] border-0"
                                style={{
                                  background: "rgba(239,68,68,0.12)",
                                  color: "#ef4444",
                                }}
                              >
                                Quarantined
                              </Badge>
                            </TableCell>
                            <TableCell className="py-4">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg"
                                  style={{
                                    borderColor: "var(--border)",
                                    color: "var(--secondary-foreground)",
                                  }}
                                  onClick={() => handleUnflag(domain)}
                                  disabled={busyId === domain.id}
                                >
                                  {busyId === domain.id ? (
                                    <Loader2 className="size-3 mr-1 animate-spin" />
                                  ) : (
                                    <RotateCcw className="size-3 mr-1" />
                                  )}
                                  Unflag
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="rounded-lg"
                                  onClick={() => handleDelete(domain)}
                                  disabled={busyId === domain.id}
                                >
                                  <Trash2 className="size-3 mr-1" />
                                  Delete
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
                  <div
                    className="flex items-center justify-between px-4 py-3 border-t mt-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <p
                      className="text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Menampilkan {(currentPage - 1) * perPage + 1}–
                      {Math.min(currentPage * perPage, total)} dari {total}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => p - 1)}
                        className="h-8 w-8 p-0"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span
                        className="px-3 text-sm"
                        style={{ color: "var(--secondary-foreground)" }}
                      >
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => p + 1)}
                        className="h-8 w-8 p-0"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  )
}
