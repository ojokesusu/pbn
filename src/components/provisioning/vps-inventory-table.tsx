"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { HealthServer } from "@/types/provisioning";

type Props = {
  servers: HealthServer[];
};

function relativeTime(iso: string): string {
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "-";
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}d lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m lalu`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}j lalu`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}h lalu`;
}

function ramBarColor(pct: number): string {
  if (pct > 85) return "bg-red-500";
  if (pct > 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function healthBadge(s: HealthServer) {
  if (!s.olsRunning) {
    return (
      <Badge className="bg-red-500 hover:bg-red-500 text-white">Down</Badge>
    );
  }
  if (s.ramUsedPct > 80 || s.isStale) {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500 text-white">
        {s.isStale ? "Stale" : "Warning"}
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white">
      Healthy
    </Badge>
  );
}

function tierBadgeStyle(tier: string): string {
  const t = (tier || "").toLowerCase();
  if (t.includes("premium") || t === "high") return "bg-purple-500 text-white hover:bg-purple-500";
  if (t.includes("standard") || t === "mid") return "bg-teal-500 text-white hover:bg-teal-500";
  if (t.includes("budget") || t === "low") return "bg-cyan-500 text-white hover:bg-cyan-500";
  return "bg-muted text-foreground hover:bg-muted";
}

function stackBadgeStyle(stack: string): string {
  const s = (stack || "").toLowerCase();
  if (s.includes("ols") || s.includes("litespeed")) return "bg-lime-500 text-white hover:bg-lime-500";
  if (s.includes("nginx")) return "bg-emerald-500 text-white hover:bg-emerald-500";
  if (s.includes("apache")) return "bg-pink-500 text-white hover:bg-pink-500";
  return "bg-muted text-foreground hover:bg-muted";
}

export default function VPSInventoryTable({ servers }: Props) {
  const list = Array.isArray(servers) ? [...servers] : [];
  list.sort((a, b) => (b.capacityUsedPct ?? 0) - (a.capacityUsedPct ?? 0));

  if (list.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Belum ada server.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Region</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Stack</TableHead>
            <TableHead>OLS</TableHead>
            <TableHead className="min-w-[140px]">RAM</TableHead>
            <TableHead>Domains</TableHead>
            <TableHead>Health</TableHead>
            <TableHead className="text-right">Last Check</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((s) => {
            const ramPct = Math.min(100, Math.max(0, s.ramUsedPct ?? 0));
            const capPct = Math.min(
              100,
              Math.max(0, s.capacityUsedPct ?? 0)
            );
            return (
              <TableRow key={s.serverId}>
                <TableCell className="font-medium">{s.label}</TableCell>
                <TableCell className="font-mono text-xs">{s.host}</TableCell>
                <TableCell className="text-sm">{s.provider}</TableCell>
                <TableCell className="text-sm">{s.region}</TableCell>
                <TableCell>
                  <Badge className={tierBadgeStyle(s.tier)}>{s.tier || "-"}</Badge>
                </TableCell>
                <TableCell>
                  <Badge className={stackBadgeStyle(s.stack)}>{s.stack || "-"}</Badge>
                </TableCell>
                <TableCell>
                  <span
                    className={
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
                      (s.olsRunning
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700")
                    }
                  >
                    <span
                      className={
                        "mr-1.5 h-1.5 w-1.5 rounded-full " +
                        (s.olsRunning ? "bg-emerald-500" : "bg-red-500")
                      }
                    />
                    {s.olsRunning ? "Up" : "Down"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 min-w-[120px]">
                    <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
                      <div
                        className={"h-full rounded " + ramBarColor(ramPct)}
                        style={{ width: `${ramPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                      <span>
                        {Math.round((s.ramUsedMb ?? 0) / 1024)}/
                        {Math.round((s.ramTotalMb ?? 0) / 1024)} GB
                      </span>
                      <span>{ramPct.toFixed(0)}%</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs tabular-nums">
                      {s.domainCount}/{s.domainCap}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {capPct.toFixed(0)}%
                    </span>
                  </div>
                </TableCell>
                <TableCell>{healthBadge(s)}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                  {relativeTime(s.checkedAt)}
                  {s.isStale && (
                    <Badge
                      variant="outline"
                      className="ml-1 border-amber-500 text-amber-600 text-[10px] px-1 py-0"
                    >
                      stale
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
