"use client"

import { useEffect, useState, useCallback } from "react"
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Trash2,
  Loader2,
  Pause,
  Play,
  LineChart as LineChartIcon,
} from "lucide-react"
import { LineChart, Line, YAxis, ResponsiveContainer, Tooltip } from "recharts"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { UrlLink } from "@/components/ui/url-link"

interface RankKeyword {
  id: string
  keyword: string
  domainId: string | null
  domain: { id: string; name: string; url: string } | null
  targetUrl: string
  locale: string
  region: string
  device: string
  active: boolean
  source: string
  lastChecked: string | null
  createdAt: string
  latestSnapshot: {
    id: string
    position: number
    foundUrl: string
    checkedAt: string
  } | null
}

interface DomainOption {
  id: string
  name: string
  url: string
}

interface Snapshot {
  id: string
  position: number
  foundUrl: string
  checkedAt: string
}

// Sparkline color per keyword — keep things deterministic so a keyword's
// chart color doesn't change between renders.
const SPARK_COLOR = "#0ea5e9"

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

// Sparkline subcomponent — fetches its own snapshot history. Kept inline
// rather than in a sibling file because it has no reuse outside this page
// and the contract is just (keywordId, onLoaded(snapshots)).
function Sparkline({
  keywordId,
  onLoaded,
}: {
  keywordId: string
  onLoaded?: (snaps: Snapshot[]) => void
}) {
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/seo/snapshots?keywordId=${keywordId}&days=14`)
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const data: Snapshot[] = json.data ?? []
        setSnaps(data)
        if (onLoaded) onLoaded(data)
      } catch {
        // sparkline is best-effort; bail quietly
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [keywordId, onLoaded])

  if (!snaps) {
    return <Skeleton className="h-8 w-24" style={{ background: "var(--muted)" }} />
  }
  if (snaps.length < 2) {
    return (
      <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
        Belum cukup data
      </span>
    )
  }

  // -1 (not found) → flatten to 101 so the line still has a visible point
  // below all real ranks; it reads as "out of top 100" without breaking scale.
  const chartData = snaps.map((s) => ({
    pos: s.position < 0 ? 101 : s.position,
    checkedAt: s.checkedAt,
  }))

  return (
    <div className="h-8 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          {/* Inverted Y — lower SERP position = higher in chart. */}
          <YAxis hide domain={[1, 101]} reversed />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 11,
              padding: "4px 8px",
            }}
            formatter={(v) => {
              const n = typeof v === "number" ? v : Number(v)
              return [n > 100 ? "Tidak ditemukan" : `Posisi ${n}`, "Rank"]
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as { checkedAt?: string } | undefined
              return p?.checkedAt
                ? new Date(p.checkedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
                : ""
            }}
          />
          <Line
            type="monotone"
            dataKey="pos"
            stroke={SPARK_COLOR}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function PositionCell({ keyword, delta7d }: { keyword: RankKeyword; delta7d: number | null }) {
  const pos = keyword.latestSnapshot?.position
  if (pos === undefined || pos === null) {
    return <span style={{ color: "var(--muted-foreground)" }}>—</span>
  }
  if (pos < 0) {
    return (
      <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(100,116,139,0.1)", color: "#64748b", borderColor: "transparent" }}>
        Tidak ditemukan
      </Badge>
    )
  }

  // Negative delta = improved (lower SERP position number is better).
  let arrow = <Minus className="size-3" style={{ color: "#94a3b8" }} />
  let arrowColor = "#94a3b8"
  if (delta7d !== null && delta7d < 0) {
    arrow = <TrendingUp className="size-3" style={{ color: "#10b981" }} />
    arrowColor = "#10b981"
  } else if (delta7d !== null && delta7d > 0) {
    arrow = <TrendingDown className="size-3" style={{ color: "#ef4444" }} />
    arrowColor = "#ef4444"
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-base font-bold tabular-nums" style={{ color: "var(--foreground)" }}>
        #{pos}
      </span>
      {arrow}
      {delta7d !== null && delta7d !== 0 && (
        <span className="text-[10px] font-semibold tabular-nums" style={{ color: arrowColor }}>
          {delta7d > 0 ? "+" : ""}{delta7d}
        </span>
      )}
    </div>
  )
}

export default function SeoRanksPage() {
  const confirm = useConfirm()
  const [keywords, setKeywords] = useState<RankKeyword[]>([])
  const [loading, setLoading] = useState(true)
  const [domains, setDomains] = useState<DomainOption[]>([])

  // Map keywordId -> 7-day delta (current_pos - 7_days_ago_pos). Negative=improved.
  const [deltaByKeyword, setDeltaByKeyword] = useState<Record<string, number | null>>({})

  // Add-keyword dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newKeyword, setNewKeyword] = useState("")
  const [newDomainId, setNewDomainId] = useState("")
  const [newTargetUrl, setNewTargetUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Row-level action state
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchKeywords = useCallback(async () => {
    try {
      const res = await fetch("/api/seo/keywords")
      if (!res.ok) throw new Error("Failed to fetch")
      const json = await res.json()
      setKeywords(json.data ?? [])
    } catch (error) {
      console.error("Failed to fetch rank keywords:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Domains list for the "bind to domain" dropdown in the add dialog.
  // Legacy endpoint shape (plain array) is fine here — we only need id/name/url.
  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch("/api/domains")
      if (!res.ok) return
      const json = await res.json()
      const list: DomainOption[] = (Array.isArray(json) ? json : json.data ?? []).map(
        (d: { id: string; name: string; url: string }) => ({
          id: d.id,
          name: d.name,
          url: d.url,
        })
      )
      setDomains(list)
    } catch {
      // optional — operator can still add a manual keyword without a domain
    }
  }, [])

  useEffect(() => {
    fetchKeywords()
    fetchDomains()
  }, [fetchKeywords, fetchDomains])

  // When the sparkline finishes loading snapshots, compute the 7-day delta:
  // current position (latest) minus position seen ~7 days ago (oldest entry
  // newer than 7d cutoff). Negative = improved.
  const recordSparkData = useCallback((keywordId: string, snaps: Snapshot[]) => {
    setDeltaByKeyword((prev) => {
      if (snaps.length === 0) return { ...prev, [keywordId]: null }
      const latest = snaps[snaps.length - 1]
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
      const old = snaps.find((s) => new Date(s.checkedAt).getTime() >= cutoff - 24 * 60 * 60 * 1000)
      if (!old || old.id === latest.id) return { ...prev, [keywordId]: null }
      const latestPos = latest.position < 0 ? 101 : latest.position
      const oldPos = old.position < 0 ? 101 : old.position
      return { ...prev, [keywordId]: latestPos - oldPos }
    })
  }, [])

  async function handleAdd() {
    if (!newKeyword.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/seo/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: newKeyword.trim(),
          domainId: newDomainId || undefined,
          targetUrl: newTargetUrl.trim() || undefined,
          locale: "id",
          region: "ID",
          device: "desktop",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Gagal menambah keyword")
      setDialogOpen(false)
      setNewKeyword("")
      setNewDomainId("")
      setNewTargetUrl("")
      await fetchKeywords()
    } catch (err) {
      await confirm({
        title: "✗ Gagal",
        message: err instanceof Error ? err.message : "Unknown error",
        confirmText: "OK",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleActive(keyword: RankKeyword) {
    setTogglingId(keyword.id)
    try {
      const res = await fetch(`/api/seo/keywords/${keyword.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !keyword.active }),
      })
      if (!res.ok) throw new Error("Failed to toggle")
      setKeywords((prev) =>
        prev.map((k) => (k.id === keyword.id ? { ...k, active: !k.active } : k))
      )
    } catch (err) {
      console.error("Failed to toggle keyword:", err)
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(keyword: RankKeyword) {
    const ok = await confirm({
      title: "Hapus keyword?",
      message: `Keyword "${keyword.keyword}" dan semua history snapshot-nya akan dihapus permanen.`,
      confirmText: "Hapus",
      variant: "danger",
    })
    if (!ok) return
    setDeletingId(keyword.id)
    try {
      const res = await fetch(`/api/seo/keywords/${keyword.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      setKeywords((prev) => prev.filter((k) => k.id !== keyword.id))
    } catch (err) {
      console.error("Failed to delete keyword:", err)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <SidebarInset>
      <AppHeader title="SEO Rank Tracker" />
      <div
        className="flex-1 space-y-4 md:space-y-6 p-3 md:p-6"
        style={{ background: "var(--background)", minHeight: "100vh" }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              className="text-xl md:text-2xl font-extrabold tracking-tight"
              style={{ color: "var(--foreground)" }}
            >
              SEO Rank Tracker
            </h2>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Pantau posisi keyword di Google. Auto-check 1x/hari per keyword aktif.
            </p>
          </div>
          <Button
            className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20 transition-all"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Tambah Keyword
          </Button>
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
              <LineChartIcon className="size-5" style={{ color: "#0ea5e9" }} />
              Tracked Keywords
            </CardTitle>
            <CardDescription style={{ color: "var(--muted-foreground)" }}>
              {loading
                ? "Memuat keyword..."
                : `${keywords.length} keyword (${keywords.filter((k) => k.active).length} aktif)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" style={{ background: "var(--muted)" }} />
                ))}
              </div>
            ) : keywords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <LineChartIcon className="size-12" style={{ color: "rgba(14,165,233,0.3)" }} />
                <h3 className="mt-4 text-lg font-semibold" style={{ color: "var(--foreground)" }}>
                  Belum ada keyword
                </h3>
                <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Belum ada keyword. Tambahkan keyword pertama untuk mulai tracking.
                </p>
                <Button
                  className="mt-4 bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg"
                  onClick={() => setDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Tambah Keyword
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-b" style={{ borderColor: "var(--border)" }}>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>
                      Keyword
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>
                      Domain
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>
                      Posisi Sekarang
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>
                      Δ 7 hari
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>
                      Sparkline
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>
                      Last Check
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-right py-4" style={{ color: "var(--muted-foreground)" }}>
                      Aksi
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keywords.map((keyword) => {
                    const delta = deltaByKeyword[keyword.id] ?? null
                    return (
                      <TableRow
                        key={keyword.id}
                        className="transition-colors border-b"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <TableCell className="font-medium py-4" style={{ color: "var(--secondary-foreground)" }}>
                          <div className="flex items-center gap-2">
                            <span>{keyword.keyword}</span>
                            {!keyword.active && (
                              <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(100,116,139,0.1)", color: "#64748b", borderColor: "transparent" }}>
                                Paused
                              </Badge>
                            )}
                          </div>
                          {keyword.targetUrl && (
                            <UrlLink href={keyword.targetUrl} truncate={40} className="text-[10px] block">
                              {keyword.targetUrl.replace(/^https?:\/\//, "")}
                            </UrlLink>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          {keyword.domain ? (
                            <UrlLink href={keyword.domain.url} truncate={32}>
                              {keyword.domain.name}
                            </UrlLink>
                          ) : (
                            <span style={{ color: "var(--muted-foreground)" }}>—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          <PositionCell keyword={keyword} delta7d={delta} />
                        </TableCell>
                        <TableCell className="py-4">
                          {delta === null ? (
                            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>—</span>
                          ) : delta === 0 ? (
                            <span className="text-xs tabular-nums" style={{ color: "#94a3b8" }}>0</span>
                          ) : delta < 0 ? (
                            <span className="text-xs font-semibold tabular-nums" style={{ color: "#10b981" }}>
                              {delta}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold tabular-nums" style={{ color: "#ef4444" }}>
                              +{delta}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-4">
                          <Sparkline
                            keywordId={keyword.id}
                            onLoaded={(snaps) => recordSparkData(keyword.id, snaps)}
                          />
                        </TableCell>
                        <TableCell className="py-4">
                          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                            {formatDate(keyword.lastChecked)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right py-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="hover:bg-[rgba(14,165,233,0.1)]"
                              style={{ color: "var(--muted-foreground)" }}
                              onClick={() => handleToggleActive(keyword)}
                              disabled={togglingId === keyword.id}
                              title={keyword.active ? "Pause tracking" : "Resume tracking"}
                            >
                              {togglingId === keyword.id ? (
                                <Loader2 className="animate-spin" />
                              ) : keyword.active ? (
                                <Pause />
                              ) : (
                                <Play />
                              )}
                              <span className="sr-only">{keyword.active ? "Pause" : "Resume"}</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => handleDelete(keyword)}
                              disabled={deletingId === keyword.id}
                            >
                              {deletingId === keyword.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                              <span className="sr-only">Hapus</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add keyword dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="rounded-xl border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <DialogHeader>
              <DialogTitle style={{ color: "var(--foreground)" }}>Tambah Keyword</DialogTitle>
              <DialogDescription style={{ color: "var(--muted-foreground)" }}>
                Tambah keyword baru buat di-track. Default locale Indonesia (id-ID, desktop).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--secondary-foreground)" }}>
                  Keyword <span className="text-red-400">*</span>
                </label>
                <Input
                  placeholder="cth: jasa seo jakarta"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  className="rounded-lg"
                  style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--secondary-foreground)" }}>
                  Domain (opsional)
                </label>
                <select
                  value={newDomainId}
                  onChange={(e) => setNewDomainId(e.target.value)}
                  className="h-9 w-full rounded-lg border px-3 text-sm"
                  style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                >
                  <option value="">— Tidak terikat domain —</option>
                  {domains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--secondary-foreground)" }}>
                  Target URL (opsional)
                </label>
                <Input
                  placeholder="https://contoh.com/halaman"
                  value={newTargetUrl}
                  onChange={(e) => setNewTargetUrl(e.target.value)}
                  className="rounded-lg"
                  style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                />
                <p className="mt-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                  URL spesifik yang dicari di SERP. Kosongkan kalau cuma mau lihat domain rank-nya.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="border-[color:var(--border)] hover:bg-[color:var(--muted)]"
                style={{ color: "var(--muted-foreground)" }}
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Batal
              </Button>
              <Button
                onClick={handleAdd}
                disabled={submitting || !newKeyword.trim()}
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                    Menambah...
                  </>
                ) : (
                  "Tambah"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SidebarInset>
  )
}
