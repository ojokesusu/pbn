"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Activity,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Monitor,
  Smartphone,
  RefreshCw,
  Loader2,
} from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useAdminGuard } from "@/hooks/use-me"
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

type LoginAttempt = {
  id: string
  username: string
  ip: string
  userAgent: string
  success: boolean
  reason: string
  country: string
  countryCode: string
  city: string
  region: string
  createdAt: string
}

// ISO 3166-1 alpha-2 → flag emoji (regional indicator symbols).
function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return ""
  const chars = [...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))
  return String.fromCodePoint(...chars)
}

function locationLabel(a: LoginAttempt): { flag: string; primary: string; secondary: string } {
  if (a.country === "Local") return { flag: "🏠", primary: "Local", secondary: "" }
  if (!a.country && !a.city) return { flag: "", primary: "—", secondary: "" }
  const parts = [a.city, a.region].filter((p) => p && p !== a.country)
  return {
    flag: flagEmoji(a.countryCode),
    primary: a.country || "Unknown",
    secondary: parts.join(", "),
  }
}

type ApiResponse = {
  items: LoginAttempt[]
  page: number
  perPage: number
  total: number
  totalPages: number
  summary: {
    failedLastHour: number
    todaySuccess: number
    todayFailed: number
    todayUniqueIps: number
  }
}

type StatusFilter = "all" | "success" | "failed"

// Simple UA → readable device/browser summary
function parseDevice(ua: string): { kind: "desktop" | "mobile"; label: string } {
  if (!ua) return { kind: "desktop", label: "Unknown" }
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua)
  let browser = "Browser"
  if (/Edg\//.test(ua)) browser = "Edge"
  else if (/Chrome\//.test(ua)) browser = "Chrome"
  else if (/Firefox\//.test(ua)) browser = "Firefox"
  else if (/Safari\//.test(ua)) browser = "Safari"
  let os = ""
  if (/Windows/i.test(ua)) os = "Windows"
  else if (/Mac OS X/i.test(ua)) os = "macOS"
  else if (/Android/i.test(ua)) os = "Android"
  else if (/iPhone|iPad|iOS/i.test(ua)) os = "iOS"
  else if (/Linux/i.test(ua)) os = "Linux"
  const label = [browser, os].filter(Boolean).join(" / ") || "Unknown"
  return { kind: isMobile ? "mobile" : "desktop", label }
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return "baru saja"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m lalu`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}j lalu`
  const day = Math.floor(hr / 24)
  return `${day}h lalu`
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    "": "—",
    ok: "Berhasil",
    wrong_password: "Password salah",
    wrong_password_locked: "Password salah → akun dikunci",
    user_not_found: "User tidak ditemukan",
    locked: "Akun terkunci",
    rate_limited: "Rate limit (terlalu banyak percobaan)",
    inactive: "Akun nonaktif",
  }
  return map[reason] || reason || "—"
}

export default function ActivityLogPage() {
  const { isAdmin, loading: meLoading } = useAdminGuard()

  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const perPage = 25

  const load = useCallback(
    async (opts: { showSpinner?: boolean } = {}) => {
      if (opts.showSpinner) setRefreshing(true)
      try {
        const params = new URLSearchParams()
        if (search) params.set("username", search)
        if (status !== "all") params.set("status", status)
        if (from) params.set("from", from)
        if (to) params.set("to", to)
        params.set("page", String(page))
        params.set("perPage", String(perPage))
        const res = await fetch(`/api/activity-log/login-attempts?${params}`)
        if (!res.ok) return
        const json = (await res.json()) as ApiResponse
        setData(json)
      } catch (err) {
        console.error("Failed to load activity log:", err)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [search, status, from, to, page]
  )

  useEffect(() => {
    if (!isAdmin) return
    load()
  }, [isAdmin, load])

  // Auto-refresh every 30s (silent, no spinner)
  useEffect(() => {
    if (!isAdmin) return
    const id = setInterval(() => load(), 30_000)
    return () => clearInterval(id)
  }, [isAdmin, load])

  function resetFilters() {
    setSearch("")
    setStatus("all")
    setFrom("")
    setTo("")
    setPage(1)
  }

  if (meLoading || !isAdmin) {
    return (
      <SidebarInset>
        <AppHeader title="Activity Log" />
        <div
          className="flex-1 p-6"
          style={{ background: "var(--background)", minHeight: "100vh" }}
        />
      </SidebarInset>
    )
  }

  const summary = data?.summary
  const items = data?.items ?? []
  const totalPages = data?.totalPages ?? 1
  const total = data?.total ?? 0

  return (
    <SidebarInset>
      <AppHeader title="Activity Log" />
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
              Activity Log
            </h2>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Riwayat login & percobaan login — untuk pantau keamanan dashboard.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setPage(1)
              load({ showSpinner: true })
            }}
            disabled={refreshing}
            className="rounded-lg self-start sm:self-auto"
            style={{
              borderColor: "var(--border)",
              color: "var(--secondary-foreground)",
            }}
          >
            {refreshing ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="size-4 mr-1" />
            )}
            Refresh
          </Button>
        </div>

        {/* Warning banner — failed attempts in last hour */}
        {summary && summary.failedLastHour >= 5 && (
          <div
            className="rounded-xl border px-4 py-3 flex items-start gap-3"
            style={{
              background: "rgba(239,68,68,0.08)",
              borderColor: "rgba(239,68,68,0.3)",
            }}
          >
            <AlertTriangle
              className="size-5 shrink-0 mt-0.5"
              style={{ color: "#ef4444" }}
            />
            <div className="flex-1">
              <p
                className="text-sm font-semibold"
                style={{ color: "var(--foreground)" }}
              >
                Peringatan: {summary.failedLastHour} percobaan login gagal dalam
                1 jam terakhir
              </p>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--muted-foreground)" }}
              >
                Kalau kamu tidak kenal IP-nya, ada kemungkinan seseorang sedang
                mencoba brute-force akun. Filter "Status: Gagal" untuk lihat
                detail.
              </p>
            </div>
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card
            className="rounded-xl border shadow-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <CardContent className="p-4">
              <div
                className="text-[10px] uppercase tracking-wider mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Login Sukses Hari Ini
              </div>
              <div
                className="text-2xl font-extrabold tabular-nums"
                style={{ color: "#10b981" }}
              >
                {summary?.todaySuccess ?? "—"}
              </div>
            </CardContent>
          </Card>
          <Card
            className="rounded-xl border shadow-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <CardContent className="p-4">
              <div
                className="text-[10px] uppercase tracking-wider mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Login Gagal Hari Ini
              </div>
              <div
                className="text-2xl font-extrabold tabular-nums"
                style={{
                  color:
                    summary && summary.todayFailed > 0 ? "#ef4444" : "#64748b",
                }}
              >
                {summary?.todayFailed ?? "—"}
              </div>
            </CardContent>
          </Card>
          <Card
            className="rounded-xl border shadow-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <CardContent className="p-4">
              <div
                className="text-[10px] uppercase tracking-wider mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                Gagal 1 Jam Terakhir
              </div>
              <div
                className="text-2xl font-extrabold tabular-nums"
                style={{
                  color:
                    summary && summary.failedLastHour >= 5
                      ? "#ef4444"
                      : summary && summary.failedLastHour > 0
                      ? "#f59e0b"
                      : "#64748b",
                }}
              >
                {summary?.failedLastHour ?? "—"}
              </div>
            </CardContent>
          </Card>
          <Card
            className="rounded-xl border shadow-sm"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <CardContent className="p-4">
              <div
                className="text-[10px] uppercase tracking-wider mb-1"
                style={{ color: "var(--muted-foreground)" }}
              >
                IP Unik Hari Ini
              </div>
              <div
                className="text-2xl font-extrabold tabular-nums"
                style={{ color: "#0ea5e9" }}
              >
                {summary?.todayUniqueIps ?? "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main table */}
        <Card
          className="rounded-xl border shadow-lg"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <CardHeader>
            <CardTitle
              className="flex items-center gap-2"
              style={{ color: "var(--foreground)" }}
            >
              <Activity className="size-5" style={{ color: "#0ea5e9" }} />
              Riwayat Login
            </CardTitle>
            <CardDescription style={{ color: "var(--muted-foreground)" }}>
              {loading ? "Memuat..." : `${total.toLocaleString("id-ID")} record`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="mb-4 flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[220px]">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-4"
                  style={{ color: "var(--muted-foreground)" }}
                />
                <Input
                  placeholder="Cari username..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                  className="pl-10 rounded-lg"
                  style={{
                    background: "var(--background)",
                    borderColor: "var(--border)",
                    color: "var(--secondary-foreground)",
                  }}
                />
              </div>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as StatusFilter)
                  setPage(1)
                }}
                className="h-9 rounded-lg border px-3 text-sm"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--secondary-foreground)",
                }}
              >
                <option value="all">Status: Semua</option>
                <option value="success">Hanya Sukses</option>
                <option value="failed">Hanya Gagal</option>
              </select>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value)
                  setPage(1)
                }}
                className="h-9 rounded-lg border px-3 text-sm"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--secondary-foreground)",
                }}
                title="Dari tanggal"
              />
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value)
                  setPage(1)
                }}
                className="h-9 rounded-lg border px-3 text-sm"
                style={{
                  background: "var(--card)",
                  borderColor: "var(--border)",
                  color: "var(--secondary-foreground)",
                }}
                title="Sampai tanggal"
              />
              {(search || status !== "all" || from || to) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-9"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Reset
                </Button>
              )}
            </div>

            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="h-12 w-full"
                    style={{ background: "var(--muted)" }}
                  />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity
                  className="size-12"
                  style={{ color: "rgba(14,165,233,0.3)" }}
                />
                <h3
                  className="mt-4 text-lg font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  Tidak ada record
                </h3>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Coba ubah filter atau tunggu ada percobaan login baru.
                </p>
              </div>
            ) : (
              <>
                {/* ─── Mobile card view (< md) ─── */}
                <div className="md:hidden space-y-2.5">
                  {items.map((a) => {
                    const device = parseDevice(a.userAgent)
                    const loc = locationLabel(a)
                    return (
                      <div
                        key={a.id}
                        className="rounded-lg border p-3"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--card)",
                        }}
                      >
                        {/* Row 1: status + username */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {a.success ? (
                              <Badge
                                variant="outline"
                                className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[10px]"
                              >
                                <CheckCircle2 className="size-3 mr-1" />
                                Sukses
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-red-500/15 text-red-500 border-red-500/30 text-[10px]"
                              >
                                <XCircle className="size-3 mr-1" />
                                Gagal
                              </Badge>
                            )}
                            <span
                              className="font-mono text-sm font-semibold truncate"
                              style={{ color: "var(--foreground)" }}
                            >
                              {a.username || "—"}
                            </span>
                          </div>
                          <span
                            className="text-[10px] shrink-0"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {timeAgo(a.createdAt)}
                          </span>
                        </div>

                        {/* Reason (only if failure, or meaningful) */}
                        {!a.success && (
                          <p
                            className="mt-1.5 text-xs"
                            style={{ color: "var(--foreground)" }}
                          >
                            {reasonLabel(a.reason)}
                          </p>
                        )}

                        {/* Row 3: location + IP */}
                        <div className="mt-2 flex items-center gap-1.5 text-xs">
                          {loc.flag && <span className="text-sm shrink-0">{loc.flag}</span>}
                          <span
                            className="font-medium truncate"
                            style={{ color: "var(--foreground)" }}
                          >
                            {loc.primary}
                          </span>
                          {loc.secondary && (
                            <span
                              className="truncate"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              · {loc.secondary}
                            </span>
                          )}
                        </div>

                        {/* Row 4: IP + device */}
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                          <span
                            className="font-mono truncate"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {a.ip || "—"}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {device.kind === "mobile" ? (
                              <Smartphone
                                className="size-3"
                                style={{ color: "var(--muted-foreground)" }}
                              />
                            ) : (
                              <Monitor
                                className="size-3"
                                style={{ color: "var(--muted-foreground)" }}
                              />
                            )}
                            <span
                              className="truncate max-w-[140px]"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              {device.label}
                            </span>
                          </div>
                        </div>

                        {/* Full timestamp */}
                        <p
                          className="mt-1 font-mono text-[10px]"
                          style={{ color: "var(--muted-foreground)", opacity: 0.7 }}
                        >
                          {formatDateTime(a.createdAt)}
                        </p>
                      </div>
                    )
                  })}
                </div>

                {/* ─── Desktop table view (>= md) ─── */}
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
                        Waktu
                      </TableHead>
                      <TableHead
                        className="text-xs uppercase tracking-wider py-4"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Username
                      </TableHead>
                      <TableHead
                        className="text-xs uppercase tracking-wider py-4"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Status
                      </TableHead>
                      <TableHead
                        className="text-xs uppercase tracking-wider py-4"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Alasan
                      </TableHead>
                      <TableHead
                        className="text-xs uppercase tracking-wider py-4"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        IP
                      </TableHead>
                      <TableHead
                        className="text-xs uppercase tracking-wider py-4"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Lokasi
                      </TableHead>
                      <TableHead
                        className="text-xs uppercase tracking-wider py-4"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Device
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((a) => {
                      const device = parseDevice(a.userAgent)
                      const loc = locationLabel(a)
                      return (
                        <TableRow
                          key={a.id}
                          className="transition-colors border-b"
                          style={{ borderColor: "var(--border)" }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "rgba(14,165,233,0.04)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          <TableCell className="py-3">
                            <div
                              className="text-xs font-mono"
                              style={{ color: "var(--foreground)" }}
                            >
                              {formatDateTime(a.createdAt)}
                            </div>
                            <div
                              className="text-[10px]"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              {timeAgo(a.createdAt)}
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <span
                              className="font-mono text-xs font-medium"
                              style={{ color: "var(--foreground)" }}
                            >
                              {a.username || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="py-3">
                            {a.success ? (
                              <Badge
                                variant="outline"
                                className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                              >
                                <CheckCircle2 className="size-3 mr-1" />
                                Sukses
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-red-500/15 text-red-500 border-red-500/30"
                              >
                                <XCircle className="size-3 mr-1" />
                                Gagal
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            <span
                              className="text-xs"
                              style={{
                                color: a.success
                                  ? "var(--muted-foreground)"
                                  : "var(--foreground)",
                              }}
                            >
                              {reasonLabel(a.reason)}
                            </span>
                          </TableCell>
                          <TableCell className="py-3">
                            <span
                              className="font-mono text-xs"
                              style={{ color: "var(--secondary-foreground)" }}
                            >
                              {a.ip || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {loc.flag && (
                                <span className="text-base leading-none shrink-0">
                                  {loc.flag}
                                </span>
                              )}
                              <div className="min-w-0">
                                <div
                                  className="text-xs font-medium truncate"
                                  style={{ color: "var(--foreground)" }}
                                >
                                  {loc.primary}
                                </div>
                                {loc.secondary && (
                                  <div
                                    className="text-[10px] truncate"
                                    style={{ color: "var(--muted-foreground)" }}
                                  >
                                    {loc.secondary}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center gap-1.5">
                              {device.kind === "mobile" ? (
                                <Smartphone
                                  className="size-3.5 shrink-0"
                                  style={{ color: "var(--muted-foreground)" }}
                                />
                              ) : (
                                <Monitor
                                  className="size-3.5 shrink-0"
                                  style={{ color: "var(--muted-foreground)" }}
                                />
                              )}
                              <span
                                className="text-xs truncate max-w-[180px]"
                                style={{ color: "var(--muted-foreground)" }}
                                title={a.userAgent}
                              >
                                {device.label}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                </div>
                {totalPages > 1 && (
                  <div
                    className="flex items-center justify-between px-4 py-3 border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <p
                      className="text-sm"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Menampilkan {(page - 1) * perPage + 1}–
                      {Math.min(page * perPage, total)} dari{" "}
                      {total.toLocaleString("id-ID")}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="h-8 w-8 p-0"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        let p: number
                        if (totalPages <= 7) p = i + 1
                        else if (page <= 4) p = i + 1
                        else if (page >= totalPages - 3) p = totalPages - 6 + i
                        else p = page - 3 + i
                        return (
                          <Button
                            key={p}
                            variant={page === p ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPage(p)}
                            className={`h-8 w-8 p-0 ${
                              page === p
                                ? "bg-[#0ea5e9] text-white hover:bg-[#0284c7]"
                                : ""
                            }`}
                            style={
                              page !== p
                                ? {
                                    borderColor: "var(--border)",
                                    color: "var(--secondary-foreground)",
                                  }
                                : {}
                            }
                          >
                            {p}
                          </Button>
                        )
                      })}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
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
