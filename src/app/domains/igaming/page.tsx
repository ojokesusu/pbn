"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  Gamepad2,
  Loader2,
  ExternalLink,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
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

// One row in the iGaming table — minted by joining NicheMapping (which holds
// the niche pin) with the Domain row (which holds isAlive / lastDeployed).
interface IGamingDomain {
  id: string
  name: string
  url: string
  niche: string
  isAlive: boolean | null
  lastDeployed: string | null
}

const PURPLE = "#a855f7"
const PURPLE_SOFT = "rgba(168,85,247,0.12)"
const PURPLE_BORDER = "rgba(168,85,247,0.25)"

export default function IGamingDomainsPage() {
  const confirm = useConfirm()
  const [domains, setDomains] = useState<IGamingDomain[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const perPage = 100

  const total = domains.length
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const pageStart = (currentPage - 1) * perPage
  const pageRows = domains.slice(pageStart, pageStart + perPage)

  const fetchDomains = useCallback(async () => {
    setLoading(true)
    try {
      // /api/domains doesn't filter by niche — we pull all rows (legacy array
      // shape, capped via ?pageSize) plus the iGaming NicheMapping page and
      // join client-side. ~2k rows is well within a single page payload.
      const [mappingRes, domainsRes] = await Promise.all([
        fetch("/api/content/niche-mapping?niche=igaming&pageSize=2000"),
        fetch("/api/domains?page=1&perPage=2000"),
      ])
      if (!mappingRes.ok) throw new Error("Failed to fetch niche mapping")
      if (!domainsRes.ok) throw new Error("Failed to fetch domains")
      const mappingJson = await mappingRes.json()
      const domainsJson = await domainsRes.json()

      const mappings: Array<{ domainId: string; niche: string }> =
        mappingJson.items ?? []
      const pinnedIds = new Set(mappings.map((m) => m.domainId))

      // /api/domains paginated path returns { data, total, stats, ... }.
      // We tolerate the legacy array shape only as defensive fallback.
      const domainRows: Array<{
        id: string
        name: string
        url: string
        isAlive: boolean | null
        lastDeployed: string | null
      }> = Array.isArray(domainsJson)
        ? domainsJson
        : (domainsJson.data ?? [])

      const joined: IGamingDomain[] = domainRows
        .filter((d) => pinnedIds.has(d.id))
        .map((d) => ({
          id: d.id,
          name: d.name,
          url: d.url,
          niche: "igaming",
          isAlive: d.isAlive,
          lastDeployed: d.lastDeployed,
        }))

      setDomains(joined)
    } catch (error) {
      console.error("Failed to fetch igaming domains:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDomains()
  }, [fetchDomains])

  async function handleUnpin(domain: IGamingDomain) {
    const ok = await confirm({
      title: "Unpin dari iGaming?",
      message:
        `${domain.name} akan dilepas dari pin iGaming. Niche akan dideteksi ulang ` +
        `dari URL — kalau gak kena pattern apapun, balik ke 'news' (fallback default).`,
      confirmText: "Ya, unpin",
    })
    if (!ok) return

    setBusyId(domain.id)
    try {
      const res = await fetch("/api/domains/igaming/unpin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId: domain.id }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || "Gagal unpin")
      }
      // Optimistic remove — page only shows niche=igaming rows.
      setDomains((prev) => prev.filter((d) => d.id !== domain.id))
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
      <AppHeader title="Domain iGaming" />
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
              <Gamepad2 className="size-6" style={{ color: PURPLE }} />
              Domain iGaming
              <Badge
                variant="outline"
                className="ml-1 border-0 text-xs font-bold"
                style={{ background: PURPLE_SOFT, color: PURPLE }}
              >
                {total} domain
              </Badge>
            </h2>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Domain yang di-pin manual untuk konten iGaming (casino/slot/judi/togel).
              Operator pin sendiri lewat tombol di tabel utama atau via menu domain
              manapun yang mau dialihkan ke konten iGaming.
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

        {/* Info banner */}
        <div
          className="rounded-xl border p-4 flex gap-3"
          style={{
            background: PURPLE_SOFT,
            borderColor: PURPLE_BORDER,
          }}
        >
          <Sparkles className="size-5 shrink-0 mt-0.5" style={{ color: PURPLE }} />
          <div className="text-sm" style={{ color: "var(--foreground)" }}>
            <strong>Pin manual</strong> — domain di bawah dipakai operator buat
            konten iGaming. Pollinations boleh dipakai khusus niche ini.
            Klik <em>Unpin</em> kalau mau kembalikan ke niche auto-detected.
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
              <Gamepad2 className="size-5" style={{ color: PURPLE }} />
              Pinned iGaming
            </CardTitle>
            <CardDescription style={{ color: "var(--muted-foreground)" }}>
              {loading
                ? "Memuat domain..."
                : `${pageRows.length} dari ${total} domain di-pin`}
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
                <Gamepad2
                  className="size-12"
                  style={{ color: "rgba(168,85,247,0.3)" }}
                />
                <h3
                  className="mt-4 text-lg font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  Belum ada domain di-pin sebagai iGaming
                </h3>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Pin via tombol Pin di halaman domain atau via niche mapping.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="md:hidden space-y-2.5">
                  {pageRows.map((domain) => (
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
                          Niche: <strong style={{ color: PURPLE }}>{domain.niche}</strong>
                        </div>
                        <div style={{ color: "var(--muted-foreground)" }}>
                          Alive: {domain.isAlive === null ? "—" : domain.isAlive ? "Yes" : "No"}
                        </div>
                        <div className="col-span-2" style={{ color: "var(--muted-foreground)" }}>
                          Last deploy: {formatDate(domain.lastDeployed)}
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
                          onClick={() => handleUnpin(domain)}
                          disabled={busyId === domain.id}
                        >
                          {busyId === domain.id ? (
                            <Loader2 className="size-3 mr-1 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3 mr-1" />
                          )}
                          Unpin
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
                          Domain URL
                        </TableHead>
                        <TableHead
                          className="text-xs uppercase tracking-wider py-4"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Niche Saat Ini
                        </TableHead>
                        <TableHead
                          className="text-xs uppercase tracking-wider py-4"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          isAlive
                        </TableHead>
                        <TableHead
                          className="text-xs uppercase tracking-wider py-4"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          lastDeployed
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
                      {pageRows.map((domain) => (
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
                          <TableCell className="py-4">
                            <Badge
                              variant="outline"
                              className="text-[10px] border-0"
                              style={{
                                background: PURPLE_SOFT,
                                color: PURPLE,
                              }}
                            >
                              {domain.niche}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-4 text-xs">
                            {domain.isAlive === null ? (
                              <span style={{ color: "var(--muted-foreground)" }}>—</span>
                            ) : domain.isAlive ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-0"
                                style={{
                                  background: "rgba(16,185,129,0.12)",
                                  color: "#10b981",
                                }}
                              >
                                Alive
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-0"
                                style={{
                                  background: "rgba(239,68,68,0.12)",
                                  color: "#ef4444",
                                }}
                              >
                                Dead
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell
                            className="py-4 text-xs"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {formatDate(domain.lastDeployed)}
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
                                onClick={() => handleUnpin(domain)}
                                disabled={busyId === domain.id}
                              >
                                {busyId === domain.id ? (
                                  <Loader2 className="size-3 mr-1 animate-spin" />
                                ) : (
                                  <RotateCcw className="size-3 mr-1" />
                                )}
                                Unpin
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
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
                      Menampilkan {pageStart + 1}–
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
