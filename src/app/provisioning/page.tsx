"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Server as ServerIcon, Filter } from "lucide-react";

import { SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useOverview,
  useHealth,
  useCapacity,
  useDeployQueue,
  useWorkers,
} from "@/hooks/use-provisioning";
import NewBatchForm from "@/components/provisioning/new-batch-form";
import ProgressTracker from "@/components/provisioning/progress-tracker";
import HealthDashboard from "@/components/provisioning/health-dashboard";
import CapacityChart from "@/components/provisioning/capacity-chart";
import VPSInventoryTable from "@/components/provisioning/vps-inventory-table";
import DeployQueueWidget from "@/components/provisioning/deploy-queue-widget";

type CapacityServer = {
  id: string;
  label: string;
  provider: string;
  region: string;
  tier: string;
  stack: string;
  domainCount: number;
  domainCap: number;
  usedPct: number;
  headroom: number;
};

const PAGE_SIZE = 25;

function providerBadgeStyle(provider: string): string {
  const p = (provider || "").toLowerCase();
  if (p.includes("idcloudhost")) return "bg-teal-500 text-white hover:bg-teal-500";
  if (p.includes("biznet")) return "bg-emerald-500 text-white hover:bg-emerald-500";
  if (p.includes("rumahweb")) return "bg-amber-500 text-white hover:bg-amber-500";
  if (p.includes("contabo")) return "bg-purple-500 text-white hover:bg-purple-500";
  return "bg-muted text-foreground hover:bg-muted";
}

function tierBadgeStyle(tier: string): string {
  const t = (tier || "").toLowerCase();
  if (t === "1gb") return "bg-amber-500 text-white hover:bg-amber-500";
  if (t === "2gb") return "bg-teal-500 text-white hover:bg-teal-500";
  if (t === "4gb") return "bg-emerald-500 text-white hover:bg-emerald-500";
  if (t === "8gb") return "bg-purple-500 text-white hover:bg-purple-500";
  return "bg-muted text-foreground hover:bg-muted";
}

function stackBadgeStyle(stack: string): string {
  const s = (stack || "").toLowerCase();
  if (s === "bare_ols") return "bg-teal-500 text-white hover:bg-teal-500";
  if (s === "aapanel_en") return "bg-amber-500 text-white hover:bg-amber-500";
  return "bg-muted text-foreground hover:bg-muted";
}

function pctBarColor(pct: number): string {
  if (pct > 85) return "bg-red-500";
  if (pct > 70) return "bg-amber-500";
  return "bg-teal-500";
}

export default function ProvisioningPage() {
  const overview = useOverview();
  const health = useHealth();
  const capacity = useCapacity();
  const queue = useDeployQueue();
  const workers = useWorkers();

  // Inventory table filter + pagination state
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [stackFilter, setStackFilter] = useState<string>("all");
  const [page, setPage] = useState<number>(1);

  const capacityServers: CapacityServer[] = useMemo(
    () => capacity.data?.servers ?? [],
    [capacity.data],
  );

  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of capacityServers) {
      if (s.provider) set.add(s.provider);
    }
    return Array.from(set).sort();
  }, [capacityServers]);

  const filteredServers = useMemo(() => {
    let list = capacityServers;
    if (providerFilter !== "all") {
      list = list.filter((s) => s.provider === providerFilter);
    }
    if (stackFilter !== "all") {
      if (stackFilter === "unmanaged") {
        list = list.filter((s) => !s.stack || s.stack === "unknown");
      } else {
        list = list.filter((s) => s.stack === stackFilter);
      }
    }
    return [...list].sort((a, b) => (b.usedPct ?? 0) - (a.usedPct ?? 0));
  }, [capacityServers, providerFilter, stackFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredServers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedServers = useMemo(
    () =>
      filteredServers.slice(
        (safePage - 1) * PAGE_SIZE,
        safePage * PAGE_SIZE,
      ),
    [filteredServers, safePage],
  );

  if (overview.loading && !overview.data) {
    return (
      <SidebarInset>
        <AppHeader title="Provisioning VPS" />
        <div className="flex-1 flex items-center justify-center p-6 md:p-8">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </SidebarInset>
    );
  }

  const stats = overview.data?.stats;
  const activeBatches = overview.data?.activeBatches ?? [];
  const healthServers = health.data ?? [];
  const totalServers = stats?.totalServers ?? 0;
  const healthyServers = stats?.healthyServers ?? 0;
  const capacityPct = Math.round(capacity.data?.total?.pct ?? 0);
  const capacityColor = capacityPct > 70 ? "text-amber-600" : "text-teal-600";
  const activeBatchCount = activeBatches.length;
  const byProvider = capacity.data?.byProvider ?? [];

  const errorMsg = overview.error ?? health.error ?? null;

  return (
    <SidebarInset>
      <AppHeader title="Provisioning VPS" />
      <div className="flex-1 space-y-6 p-6 md:p-8 overflow-y-auto">

        {/* Top action bar — add server manual */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Provisioning Cluster</h2>
            <p className="text-xs text-muted-foreground">
              Pantau kapasitas, batch otomatis, dan inventory server.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/servers/new" title="Kalau VPS sudah ada (gak butuh install otomatis), masukin creds langsung.">
              <Button variant="outline" size="sm">
                <Plus className="size-3.5" /> Tambah Server Manual
              </Button>
            </Link>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">
            <span className="font-semibold">Error:</span> {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Servers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-teal-600 tabular-nums">{totalServers}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {stats?.activeServers ?? 0} active
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Healthy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-emerald-600 tabular-nums">{healthyServers}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {stats?.staleServers ?? 0} stale
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Capacity Used</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-4xl font-bold tabular-nums ${capacityColor}`}>{capacityPct}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                {capacityPct > 70 ? "perlu kapasitas" : "sehat"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Active Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-cyan-600 tabular-nums">{activeBatchCount}</div>
              <div className="text-xs text-muted-foreground mt-1">
                batch berjalan
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Worker Daemons</CardTitle>
          </CardHeader>
          <CardContent>
            {workers.loading && !workers.data ? (
              <p className="text-sm text-muted-foreground">Loading workers...</p>
            ) : (workers.data ?? []).length === 0 ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
                <span className="font-semibold">No worker daemon detected.</span>{" "}
                Start:{" "}
                <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">
                  python worker_daemon.py
                </code>{" "}
                on RDP.
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                {(workers.data ?? []).map((w) => {
                  const dotColor =
                    w.staleSeconds < 60
                      ? "bg-emerald-500"
                      : w.staleSeconds < 120
                        ? "bg-amber-500"
                        : "bg-red-500";
                  const taskCount = w.runningTaskIds.length;
                  return (
                    <div
                      key={w.workerId}
                      className="flex items-center justify-between rounded border px-3 py-2"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{w.workerId}</div>
                          <div className="text-xs text-muted-foreground">
                            {w.hostname || "?"} &middot; pid {w.pid} &middot;{" "}
                            status {w.status}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="font-bold tabular-nums text-cyan-600">
                          {taskCount}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            running
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          last beat: {w.staleSeconds}s ago
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Buat Batch Provisioning</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Tempel kredensial VPS untuk menjalankan setup batch otomatis.
              </p>
              <NewBatchForm onSubmitSuccess={() => window.location.reload()} />
              <div className="pt-2 border-t mt-3">
                <p className="text-xs text-muted-foreground mb-2">
                  Atau, kalau VPS sudah running & ga butuh install otomatis:
                </p>
                <Link href="/servers/new">
                  <Button variant="outline" size="sm">
                    <Plus className="size-3.5" /> Tambah Server Manual
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Active Batches</CardTitle>
            </CardHeader>
            <CardContent>
              {activeBatchCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada batch aktif.
                </p>
              ) : (
                <div className="space-y-2 text-sm">
                  {activeBatches.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{b.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.provider} &middot; {b.totalTargets} VPS
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="font-bold text-cyan-600 tabular-nums">{b.progressPct}%</div>
                        <div className="text-[10px] text-muted-foreground">
                          {b.completedCount}/{b.totalTargets}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {activeBatchCount > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Progress Tracker</CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressTracker batches={activeBatches} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Health Dashboard</CardTitle>
          </CardHeader>
          <CardContent>
            <HealthDashboard servers={healthServers} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kapasitas Cluster</CardTitle>
          </CardHeader>
          <CardContent>
            <CapacityChart capacity={capacity.data} />
          </CardContent>
        </Card>

        {/* Section A: Kapasitas per Provider */}
        <Card>
          <CardHeader>
            <CardTitle>Kapasitas per Provider</CardTitle>
          </CardHeader>
          <CardContent>
            {byProvider.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada data provider.
              </p>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead className="text-right">Servers</TableHead>
                      <TableHead className="text-right">Slot</TableHead>
                      <TableHead className="text-right">Used</TableHead>
                      <TableHead className="min-w-[200px]">Usage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byProvider.map((p) => {
                      const pct = Math.min(100, Math.max(0, p.pct ?? 0));
                      return (
                        <TableRow key={p.provider}>
                          <TableCell>
                            <Badge className={providerBadgeStyle(p.provider)}>
                              {p.provider || "-"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.servers}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.slot}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {p.used}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[180px]">
                              <div className="h-1.5 flex-1 rounded bg-muted overflow-hidden">
                                <div
                                  className={"h-full rounded " + pctBarColor(pct)}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section B: Daftar Server (Inventory) */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <ServerIcon className="size-4" />
                Daftar Server (Inventory)
              </CardTitle>
              <div className="text-xs text-muted-foreground tabular-nums">
                {filteredServers.length} of {capacityServers.length} servers
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Filter className="size-3" />
                Provider:
              </div>
              <Button
                variant={providerFilter === "all" ? "default" : "outline"}
                size="xs"
                onClick={() => {
                  setProviderFilter("all");
                  setPage(1);
                }}
              >
                All
              </Button>
              {providerOptions.map((p) => (
                <Button
                  key={p}
                  variant={providerFilter === p ? "default" : "outline"}
                  size="xs"
                  onClick={() => {
                    setProviderFilter(p);
                    setPage(1);
                  }}
                >
                  {p}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Filter className="size-3" />
                Stack:
              </div>
              <Button
                variant={stackFilter === "all" ? "default" : "outline"}
                size="xs"
                onClick={() => {
                  setStackFilter("all");
                  setPage(1);
                }}
              >
                All
              </Button>
              <Button
                variant={stackFilter === "bare_ols" ? "default" : "outline"}
                size="xs"
                onClick={() => {
                  setStackFilter("bare_ols");
                  setPage(1);
                }}
              >
                bare_ols
              </Button>
              <Button
                variant={stackFilter === "aapanel_en" ? "default" : "outline"}
                size="xs"
                onClick={() => {
                  setStackFilter("aapanel_en");
                  setPage(1);
                }}
              >
                aapanel_en
              </Button>
              <Button
                variant={stackFilter === "unmanaged" ? "default" : "outline"}
                size="xs"
                onClick={() => {
                  setStackFilter("unmanaged");
                  setPage(1);
                }}
              >
                unmanaged
              </Button>
            </div>

            {capacityServers.length === 0 ? (
              <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                Belum ada server.
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
                Tidak ada server yang cocok filter.
              </div>
            ) : (
              <>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Region</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Stack</TableHead>
                        <TableHead className="text-right">Domains</TableHead>
                        <TableHead className="text-right">Headroom</TableHead>
                        <TableHead className="min-w-[180px]">Usage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedServers.map((s) => {
                        const pct = Math.min(100, Math.max(0, s.usedPct ?? 0));
                        return (
                          <TableRow
                            key={s.id}
                            className="cursor-pointer"
                            onClick={() => {
                              window.location.href = `/servers/${s.id}`;
                            }}
                          >
                            <TableCell className="font-medium">
                              <Link
                                href={`/servers/${s.id}`}
                                className="hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {s.label}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge className={providerBadgeStyle(s.provider)}>
                                {s.provider || "-"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {s.region || "-"}
                            </TableCell>
                            <TableCell>
                              <Badge className={tierBadgeStyle(s.tier)}>
                                {s.tier || "-"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={stackBadgeStyle(s.stack)}>
                                {s.stack || "unmanaged"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs tabular-nums">
                              {s.domainCount}/{s.domainCap}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {s.headroom}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 min-w-[160px]">
                                <div className="h-1.5 flex-1 rounded bg-muted overflow-hidden">
                                  <div
                                    className={"h-full rounded " + pctBarColor(pct)}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
                                  {pct.toFixed(0)}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="tabular-nums">
                      Page {safePage} of {totalPages} &middot;{" "}
                      {filteredServers.length} servers
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={safePage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={safePage >= totalPages}
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>VPS Inventory</CardTitle>
            </CardHeader>
            <CardContent>
              <VPSInventoryTable servers={healthServers} />
            </CardContent>
          </Card>
          <DeployQueueWidget queue={queue.data ?? []} />
        </div>

      </div>
    </SidebarInset>
  );
}
