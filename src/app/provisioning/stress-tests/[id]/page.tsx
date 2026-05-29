"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type StressTestDetail = {
  id: string;
  serverId: string;
  dummyCount: number;
  durationSec: number;
  concurrentWorkers: number;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  ramBaselineMb: number;
  ramPeakMb: number;
  ramAvgMb: number;
  swapUsedPeakMb: number;
  oomEvents: number;
  requestsTotal: number;
  avgResponseMs: number;
  errors: number;
  verdict: string;
  recommendation: string;
  log: string;
  errorMessage: string;
  createdAt: string | null;
  updatedAt: string | null;
  server: {
    id: string;
    label: string;
    host: string;
    tier: string | null;
    provider: string | null;
    status: string | null;
  } | null;
};

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "-";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "-";
  }
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  if (s === "running") {
    return (
      <Badge className="bg-cyan-100 text-cyan-700 border-cyan-300">
        running
      </Badge>
    );
  }
  if (s === "completed") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
        completed
      </Badge>
    );
  }
  if (s === "failed") {
    return <Badge variant="destructive">failed</Badge>;
  }
  if (s === "pending") {
    return (
      <Badge className="bg-slate-100 text-slate-700 border-slate-300">
        pending
      </Badge>
    );
  }
  return <Badge variant="secondary">{status || "-"}</Badge>;
}

function VerdictBadge({ verdict, size = "default" }: { verdict: string; size?: "default" | "lg" }) {
  const v = (verdict || "").toUpperCase();
  const sizeCls = size === "lg" ? "text-base px-3 py-1 h-auto" : "";
  if (!v) return <span className="text-sm text-muted-foreground">-</span>;
  if (v === "STABLE") {
    return (
      <Badge className={`bg-emerald-100 text-emerald-700 border-emerald-300 ${sizeCls}`}>
        STABLE
      </Badge>
    );
  }
  if (v === "SWAP_PRESSURE") {
    return (
      <Badge className={`bg-amber-100 text-amber-700 border-amber-300 ${sizeCls}`}>
        SWAP_PRESSURE
      </Badge>
    );
  }
  if (v === "OOM") {
    return (
      <Badge className={`bg-red-100 text-red-700 border-red-300 ${sizeCls}`}>
        OOM
      </Badge>
    );
  }
  if (v === "FAIL") {
    return <Badge variant="destructive" className={sizeCls}>FAIL</Badge>;
  }
  return <Badge variant="secondary" className={sizeCls}>{v}</Badge>;
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="text-2xl font-bold tabular-nums"
          style={color ? { color } : undefined}
        >
          {value}
        </div>
        {sub && (
          <div className="text-xs text-muted-foreground mt-1">{sub}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StressTestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [data, setData] = useState<StressTestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function fetchData() {
      try {
        const res = await fetch(`/api/provisioning/stress-tests/${id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const detail: StressTestDetail | null = json?.stressTest ?? null;
        setData(detail);
        setLoading(false);
        setError(null);

        const isRunning = detail?.status === "running";
        const desiredInterval = isRunning ? 5_000 : 30_000;
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(fetchData, desiredInterval);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [id]);

  if (loading && !data) {
    return (
      <SidebarInset>
        <AppHeader title="Stress Test Detail" />
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </SidebarInset>
    );
  }

  if (error && !data) {
    return (
      <SidebarInset>
        <AppHeader title="Stress Test Detail" />
        <div className="flex-1 p-6 md:p-8">
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">
            <span className="font-semibold">Error:</span> {error}
          </div>
        </div>
      </SidebarInset>
    );
  }

  if (!data) {
    return (
      <SidebarInset>
        <AppHeader title="Stress Test Detail" />
        <div className="flex-1 p-6 md:p-8 text-sm text-muted-foreground">
          Stress test tidak ditemukan.
        </div>
      </SidebarInset>
    );
  }

  const ramTotal = data.ramBaselineMb;
  const ramPeakPct = ramTotal > 0
    ? Math.round((data.ramPeakMb / ramTotal) * 100)
    : 0;

  return (
    <SidebarInset>
      <AppHeader title="Stress Test Detail" />
      <div className="flex-1 space-y-6 p-6 md:p-8 overflow-y-auto">
        {error && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-4 py-2 text-xs">
            Refresh error: {error}
          </div>
        )}

        {/* Metadata card */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Stress Test {data.id.slice(0, 8)}
                </CardTitle>
                <div className="text-sm text-muted-foreground mt-1">
                  {data.server?.label ?? "-"}{" "}
                  <span className="font-mono text-xs">
                    ({data.server?.host ?? "-"})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={data.status} />
                <VerdictBadge verdict={data.verdict} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground uppercase">
                  Dummy Count
                </div>
                <div className="font-semibold tabular-nums">
                  {data.dummyCount}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase">
                  Duration
                </div>
                <div className="font-semibold tabular-nums">
                  {formatDuration(data.durationSec)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase">
                  Workers
                </div>
                <div className="font-semibold tabular-nums">
                  {data.concurrentWorkers}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase">
                  Provider / Tier
                </div>
                <div className="font-semibold">
                  {data.server?.provider ?? "-"} / {data.server?.tier ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase">
                  Started
                </div>
                <div className="text-xs font-mono">
                  {formatDateTime(data.startedAt)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase">
                  Completed
                </div>
                <div className="text-xs font-mono">
                  {formatDateTime(data.completedAt)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase">
                  Created
                </div>
                <div className="text-xs font-mono">
                  {formatDateTime(data.createdAt)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase">
                  Updated
                </div>
                <div className="text-xs font-mono">
                  {formatDateTime(data.updatedAt)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <MetricCard
            label="RAM Baseline"
            value={`${data.ramBaselineMb} MB`}
            color="#0ea5e9"
          />
          <MetricCard
            label="RAM Peak"
            value={`${data.ramPeakMb} MB`}
            sub={ramTotal > 0 ? `${ramPeakPct}% of baseline` : undefined}
            color={ramPeakPct > 85 ? "#dc2626" : ramPeakPct >= 70 ? "#d97706" : "#10b981"}
          />
          <MetricCard
            label="RAM Avg"
            value={`${data.ramAvgMb} MB`}
            color="#64748b"
          />
          <MetricCard
            label="Swap Peak"
            value={`${data.swapUsedPeakMb} MB`}
            color={data.swapUsedPeakMb > 0 ? "#d97706" : "#10b981"}
          />
          <MetricCard
            label="OOM Events"
            value={data.oomEvents}
            color={data.oomEvents > 0 ? "#dc2626" : "#10b981"}
          />
          <MetricCard
            label="Requests Total"
            value={data.requestsTotal}
            sub={
              data.avgResponseMs > 0
                ? `avg ${data.avgResponseMs}ms · ${data.errors} err`
                : `${data.errors} errors`
            }
            color="#0891b2"
          />
        </div>

        {/* Verdict callout */}
        <Card
          className="border-2"
          style={{
            borderColor: (() => {
              const v = (data.verdict || "").toUpperCase();
              if (v === "STABLE") return "rgba(16,185,129,0.4)";
              if (v === "SWAP_PRESSURE") return "rgba(245,158,11,0.4)";
              if (v === "OOM" || v === "FAIL") return "rgba(239,68,68,0.4)";
              return "rgba(100,116,139,0.2)";
            })(),
          }}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              Verdict <VerdictBadge verdict={data.verdict} size="lg" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recommendation ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {data.recommendation}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {data.status === "running" || data.status === "pending"
                  ? "Menunggu hasil. Verdict + rekomendasi akan muncul setelah test selesai."
                  : "Belum ada rekomendasi."}
              </p>
            )}
            {data.errorMessage && (
              <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                <span className="font-semibold">Error:</span> {data.errorMessage}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Log viewer */}
        <Card>
          <CardHeader>
            <CardTitle>Log</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="h-96 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-100 font-mono whitespace-pre-wrap">
              {data.log?.trim() ? data.log : "(belum ada log)"}
            </pre>
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}
