"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HealthServer } from "@/types/provisioning";

type Props = { servers: HealthServer[] };

function relativeTime(iso: string): string {
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "-";
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function barColor(pct: number): string {
  if (pct > 85) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function Bar({ label, pct, used, total, unit }: { label: string; pct: number; used: number; total: number; unit: string }) {
  const safePct = Math.max(0, Math.min(100, pct || 0));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">
          {used.toFixed(0)}/{total.toFixed(0)} {unit} ({safePct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor(safePct)} transition-all`}
          style={{ width: `${safePct}%` }}
        />
      </div>
    </div>
  );
}

function Pill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
        ok ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      {label}
    </span>
  );
}

export default function HealthDashboard({ servers }: Props) {
  const list = Array.isArray(servers) ? servers : [];

  if (list.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Belum ada data health check.
        </CardContent>
      </Card>
    );
  }

  const healthy = list.filter(
    (s) => s.olsRunning && s.ramUsedPct < 80 && !s.isStale,
  ).length;
  const warning = list.filter(
    (s) => (s.ramUsedPct > 80 || s.isStale) && s.olsRunning,
  ).length;
  const down = list.filter((s) => !s.olsRunning).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Healthy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{healthy}</div>
            <div className="text-xs text-muted-foreground mt-1">OLS up, RAM &lt;80%, fresh</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Warning</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{warning}</div>
            <div className="text-xs text-muted-foreground mt-1">RAM tinggi atau data stale</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Down</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{down}</div>
            <div className="text-xs text-muted-foreground mt-1">OLS tidak running</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
        {list.map((s) => {
          const ramTotalGb = (s.ramTotalMb || 0) / 1024;
          const ramUsedGb = (s.ramUsedMb || 0) / 1024;
          return (
            <Card key={s.serverId} className="hover:shadow-md transition-shadow">
              <CardContent className="p-3 space-y-3">
                <div>
                  <div className="font-semibold text-sm truncate" title={s.label}>
                    {s.label}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate" title={s.host}>
                    {s.host}
                  </div>
                </div>

                <div className="space-y-2">
                  <Bar
                    label="RAM"
                    pct={s.ramUsedPct}
                    used={ramUsedGb}
                    total={ramTotalGb}
                    unit="GB"
                  />
                  <Bar
                    label="Disk"
                    pct={s.diskUsedPct}
                    used={s.diskUsedGb}
                    total={s.diskTotalGb}
                    unit="GB"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Pill label={`OLS ${s.olsRunning ? "up" : "down"}`} ok={s.olsRunning} />
                  <Pill
                    label={`FTP ${s.ftpStatus === "running" ? "up" : "down"}`}
                    ok={s.ftpStatus === "running"}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t">
                  <span className="font-mono">Load {(s.loadAvg1 ?? 0).toFixed(2)}</span>
                  <span>{relativeTime(s.checkedAt)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
