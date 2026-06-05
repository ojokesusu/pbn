"use client"

import { useEffect, useState, useCallback } from "react"
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Gauge,
  TrendingUp,
  XCircle,
  Send,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UrlLink } from "@/components/ui/url-link"

interface StatusSummary {
  totalSubmissions: number
  successCount: number
  failureCount: number
  successRate: number
  usedToday: number
  dailyCap: number
  remaining: number
}

interface DayBucket {
  date: string
  total: number
  success: number
  failure: number
}

interface TopFailingDomain {
  domainId: string
  domainName: string
  domainUrl: string
  failureCount: number
}

interface RecentFailure {
  id: string
  url: string
  httpStatus: number
  errorMessage: string
  submittedAt: string
  domain: { id: string; name: string; url: string } | null
}

interface StatusResponse {
  summary: StatusSummary
  byDay: DayBucket[]
  topFailingDomains: TopFailingDomain[]
  recentFailures: RecentFailure[]
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function fmtDateShort(iso: string): string {
  // Render YYYY-MM-DD as "DD MMM" for the chart axis. Pure date string,
  // no Date() parsing — avoids timezone shifts on the bucket key.
  const [, m, d] = iso.split("-")
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
  const mi = parseInt(m, 10) - 1
  return `${parseInt(d, 10)} ${months[mi] ?? m}`
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function GooglePingStatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/google-ping/status")
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "Gagal memuat data")
        return
      }
      setData(json)
    } catch {
      setError("Gagal terhubung ke server")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const summary = data?.summary
  const capPct = summary
    ? Math.min(100, (summary.usedToday / Math.max(1, summary.dailyCap)) * 100)
    : 0
  const capWarn = summary ? summary.usedToday > 8000 : false

  return (
    <SidebarInset>
      <AppHeader title="Google Ping Status" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center size-10 rounded-xl"
              style={{ background: "rgba(14,165,233,0.1)" }}
            >
              <Activity className="size-5" style={{ color: "#0ea5e9" }} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>
                Google Ping Status
              </h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                IndexNow submission health 7 hari terakhir
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="rounded-lg"
            style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
            onClick={() => { setLoading(true); load() }}
            disabled={loading}
          >
            {loading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
            Refresh
          </Button>
        </div>

        {error && (
          <div
            className="rounded-lg border p-4 mb-6 flex items-start gap-3"
            style={{ background: "rgba(239,68,68,0.1)", borderColor: "#fecaca" }}
          >
            <AlertCircle className="size-5 mt-0.5 text-red-500 shrink-0" />
            <div>
              <p className="font-medium text-red-700">Error</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        )}

        {loading && !data && (
          <div
            className="rounded-xl border p-12 text-center"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <Loader2 className="size-8 mx-auto animate-spin mb-3" style={{ color: "#0ea5e9" }} />
            <p style={{ color: "var(--muted-foreground)" }}>Memuat data IndexNow...</p>
          </div>
        )}

        {data && summary && (
          <>
            {/* ── 4 Stat Cards ── */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {/* Used Today + cap progress bar */}
              <div
                className="rounded-xl border p-5 shadow-sm"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Gauge className="size-5" style={{ color: capWarn ? "#d97706" : "#0ea5e9" }} />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                    Used Today
                  </p>
                </div>
                <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--foreground)" }}>
                  {summary.usedToday.toLocaleString("id-ID")}
                  <span className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>
                    /{summary.dailyCap.toLocaleString("id-ID")}
                  </span>
                </p>
                <div className="mt-2 w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${capPct}%`,
                      background: capWarn
                        ? "linear-gradient(90deg, #f59e0b, #d97706)"
                        : "linear-gradient(90deg, #0ea5e9, #0284c7)",
                    }}
                  />
                </div>
                <p className="text-[10px] mt-1.5" style={{ color: "var(--muted-foreground)" }}>
                  Sisa kuota: {summary.remaining.toLocaleString("id-ID")}
                </p>
              </div>

              {/* Success Rate */}
              <div
                className="rounded-xl border p-5 shadow-sm"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <TrendingUp className="size-5" style={{ color: "#10b981" }} />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                    Success Rate
                  </p>
                </div>
                <p className="text-2xl font-bold tabular-nums text-emerald-600">
                  {fmtPct(summary.successRate)}
                </p>
                <p className="text-[10px] mt-1.5" style={{ color: "var(--muted-foreground)" }}>
                  {summary.successCount.toLocaleString("id-ID")} sukses dari{" "}
                  {summary.totalSubmissions.toLocaleString("id-ID")}
                </p>
              </div>

              {/* Submissions 7d */}
              <div
                className="rounded-xl border p-5 shadow-sm"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Send className="size-5" style={{ color: "#0ea5e9" }} />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                    Submissions 7d
                  </p>
                </div>
                <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--foreground)" }}>
                  {summary.totalSubmissions.toLocaleString("id-ID")}
                </p>
                <p className="text-[10px] mt-1.5" style={{ color: "var(--muted-foreground)" }}>
                  Total submit ke IndexNow
                </p>
              </div>

              {/* Failures 7d */}
              <div
                className="rounded-xl border p-5 shadow-sm"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <XCircle className="size-5" style={{ color: "#ef4444" }} />
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                    Failures 7d
                  </p>
                </div>
                <p className="text-2xl font-bold tabular-nums text-red-600">
                  {summary.failureCount.toLocaleString("id-ID")}
                </p>
                <p className="text-[10px] mt-1.5" style={{ color: "var(--muted-foreground)" }}>
                  Gagal dalam 7 hari terakhir
                </p>
              </div>
            </div>

            {/* ── 7-day Chart ── */}
            <div
              className="rounded-xl border p-5 mb-6 shadow-sm"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              <h3 className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>
                Submission Trend (7 hari)
              </h3>
              <p className="text-xs mb-4" style={{ color: "var(--muted-foreground)" }}>
                Stacked bar: hijau = success, merah = failure per hari (UTC).
              </p>
              <div style={{ width: "100%", height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={data.byDay} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={fmtDateShort}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      labelFormatter={(label) => fmtDateShort(String(label))}
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="success" name="Success" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="failure" name="Failure" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Two-column: Top Failing + Recent Failures ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Failing Domains */}
              <div
                className="rounded-xl border shadow-sm overflow-hidden"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
                  <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>
                    Top Failing Domains
                  </h3>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    10 domain dengan failure terbanyak (7 hari)
                  </p>
                </div>
                {data.topFailingDomains.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <CheckCircle2 className="size-8 mx-auto mb-2 text-emerald-500" />
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      Tidak ada failure. IndexNow sehat.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {data.topFailingDomains.map((d, i) => (
                      <li
                        key={d.domainId}
                        className="px-5 py-3 flex items-center gap-3 hover:bg-[color:rgba(148,163,184,0.06)]"
                      >
                        <span
                          className="flex items-center justify-center size-6 rounded-full text-[10px] font-bold shrink-0"
                          style={{
                            background: i < 3 ? "rgba(239,68,68,0.15)" : "var(--muted)",
                            color: i < 3 ? "#dc2626" : "var(--muted-foreground)",
                          }}
                        >
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          {d.domainUrl ? (
                            <UrlLink href={d.domainUrl} truncate={48} />
                          ) : (
                            <span className="text-xs font-mono" style={{ color: "var(--muted-foreground)" }}>
                              {d.domainName}
                            </span>
                          )}
                          <p className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                            {d.domainName}
                          </p>
                        </div>
                        <Badge className="bg-red-100 text-red-700 tabular-nums">
                          {d.failureCount} fail
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Recent Failures */}
              <div
                className="rounded-xl border shadow-sm overflow-hidden"
                style={{ background: "var(--card)", borderColor: "var(--border)" }}
              >
                <div className="px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
                  <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>
                    Recent Failures
                  </h3>
                  <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    20 submission gagal paling baru
                  </p>
                </div>
                {data.recentFailures.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <CheckCircle2 className="size-8 mx-auto mb-2 text-emerald-500" />
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      Tidak ada failure terkini.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y max-h-[480px] overflow-y-auto" style={{ borderColor: "var(--border)" }}>
                    {data.recentFailures.map((f) => (
                      <li key={f.id} className="px-5 py-3">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <UrlLink href={f.url} truncate={56} />
                          <span
                            className="text-[10px] font-mono whitespace-nowrap"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            {fmtDateTime(f.submittedAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            className={
                              f.httpStatus === 0
                                ? "bg-slate-100 text-slate-700"
                                : f.httpStatus >= 500
                                  ? "bg-red-100 text-red-700"
                                  : "bg-amber-100 text-amber-700"
                            }
                          >
                            HTTP {f.httpStatus || "—"}
                          </Badge>
                          {f.errorMessage && (
                            <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                              {f.errorMessage}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </SidebarInset>
  )
}
