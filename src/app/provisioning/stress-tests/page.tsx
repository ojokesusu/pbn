"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UrlLink } from "@/components/ui/url-link";

type StressTest = {
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
  errorMessage: string;
  createdAt: string | null;
  updatedAt: string | null;
  server: {
    id: string;
    label: string;
    host: string;
    tier: string | null;
    provider: string | null;
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
    const d = new Date(iso);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
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

function VerdictBadge({ verdict }: { verdict: string }) {
  const v = (verdict || "").toUpperCase();
  if (!v) return <span className="text-xs text-muted-foreground">-</span>;
  if (v === "STABLE") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
        STABLE
      </Badge>
    );
  }
  if (v === "SWAP_PRESSURE") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-300">
        SWAP_PRESSURE
      </Badge>
    );
  }
  if (v === "OOM") {
    return <Badge className="bg-red-100 text-red-700 border-red-300">OOM</Badge>;
  }
  if (v === "FAIL") {
    return <Badge variant="destructive">FAIL</Badge>;
  }
  return <Badge variant="secondary">{v}</Badge>;
}

export default function StressTestsListPage() {
  const router = useRouter();
  const [stressTests, setStressTests] = useState<StressTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetch("/api/provisioning/stress-tests");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) {
          setStressTests(json?.stressTests ?? []);
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const total = stressTests.length;
  const stableCount = stressTests.filter(
    (t) => t.verdict.toUpperCase() === "STABLE"
  ).length;
  const oomCount = stressTests.filter(
    (t) => t.verdict.toUpperCase() === "OOM"
  ).length;
  const inProgress = stressTests.filter(
    (t) => t.status === "running" || t.status === "pending"
  ).length;

  return (
    <SidebarInset>
      <AppHeader title="Stress Test Runs" />
      <div className="flex-1 space-y-6 p-6 md:p-8 overflow-y-auto">
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Total Runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-teal-600 tabular-nums">
                {total}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                STABLE
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-emerald-600 tabular-nums">
                {stableCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                OOM
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-red-600 tabular-nums">
                {oomCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                In Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-cyan-600 tabular-nums">
                {inProgress}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Riwayat Stress Test</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && stressTests.length === 0 ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : stressTests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada stress test. Trigger lewat tombol &quot;Run Stress Test&quot; di Health Dashboard.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2 px-2 font-medium">Server</th>
                      <th className="py-2 px-2 font-medium">Dummy</th>
                      <th className="py-2 px-2 font-medium">Duration</th>
                      <th className="py-2 px-2 font-medium">Status</th>
                      <th className="py-2 px-2 font-medium">Verdict</th>
                      <th className="py-2 px-2 font-medium">RAM Peak</th>
                      <th className="py-2 px-2 font-medium">OOM</th>
                      <th className="py-2 px-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stressTests.map((t) => {
                      const ramTotal = t.ramBaselineMb || 0;
                      return (
                        <tr
                          key={t.id}
                          className="border-b cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() =>
                            router.push(`/provisioning/stress-tests/${t.id}`)
                          }
                        >
                          <td className="py-2 px-2">
                            <div className="font-medium truncate max-w-[180px]">
                              {t.server?.label ?? "-"}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                              {t.server?.host ? <UrlLink href={t.server.host} truncate={30} /> : "-"}
                            </div>
                          </td>
                          <td className="py-2 px-2 tabular-nums">
                            {t.dummyCount}
                          </td>
                          <td className="py-2 px-2 tabular-nums">
                            {formatDuration(t.durationSec)}
                          </td>
                          <td className="py-2 px-2">
                            <StatusBadge status={t.status} />
                          </td>
                          <td className="py-2 px-2">
                            <VerdictBadge verdict={t.verdict} />
                          </td>
                          <td className="py-2 px-2 tabular-nums font-mono text-xs">
                            {t.ramPeakMb}
                            {ramTotal > 0 ? `/${ramTotal}` : ""} MB
                          </td>
                          <td className="py-2 px-2 tabular-nums">
                            {t.oomEvents > 0 ? (
                              <span className="font-bold text-red-600">
                                {t.oomEvents}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground">
                            {formatDateTime(t.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}
