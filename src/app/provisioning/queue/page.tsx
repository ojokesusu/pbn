"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { UrlLink } from "@/components/ui/url-link";
import {
  ListOrdered,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
} from "lucide-react";

type QueueItem = {
  id: string;
  domainId: string;
  serverId: string | null;
  priority: number;
  status: string;
  scheduledAt: string | null;
  attemptedAt: string | null;
  errorMessage: string;
  createdAt: string;
  domain: { id: string; name: string; url: string; genre: string } | null;
  server: { id: string; label: string; host: string } | null;
};

type QueueStats = {
  totalQueued: number;
  processingNow: number;
  completedToday: number;
  scheduledNext24h: number;
};

type QueueResponse = {
  queue: QueueItem[];
  stats: QueueStats;
};

type FilterChip = "all" | "queued" | "processing" | "completed" | "failed";

const REFRESH_MS = 30_000;

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "processing") {
    return (
      <Badge className="bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300">
        <Loader2 className="size-3 animate-spin" />
        processing
      </Badge>
    );
  }
  if (s === "completed") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300">
        <CheckCircle2 className="size-3" />
        completed
      </Badge>
    );
  }
  if (s === "failed") {
    return (
      <Badge variant="destructive">
        <AlertCircle className="size-3" />
        failed
      </Badge>
    );
  }
  return <Badge variant="secondary">{s || "queued"}</Badge>;
}

export default function ProvisioningQueuePage() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterChip>("all");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/provisioning/deploy-queue", {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as QueueResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  async function handleScheduleAll() {
    setBusy(true);
    try {
      const res = await fetch("/api/provisioning/deploy-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as QueueResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(domainId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/provisioning/deploy-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", domainIds: [domainId] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as QueueResponse;
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  // TODO: implement Bulk Add Domains modal (paste/select domains -> POST {action:"add", domainIds:[...]})
  function handleBulkAddClick() {
    alert("Bulk Add Domains modal: TODO — to be implemented");
  }

  const queue = data?.queue ?? [];
  const stats = data?.stats;

  const filteredQueue =
    filter === "all"
      ? queue
      : queue.filter((q) => q.status.toLowerCase() === filter);

  const counts = {
    all: queue.length,
    queued: queue.filter((q) => q.status.toLowerCase() === "queued").length,
    processing: queue.filter((q) => q.status.toLowerCase() === "processing").length,
    completed: queue.filter((q) => q.status.toLowerCase() === "completed").length,
    failed: queue.filter((q) => q.status.toLowerCase() === "failed").length,
  };

  const chips: { key: FilterChip; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "queued", label: "Queued", count: counts.queued },
    { key: "processing", label: "Processing", count: counts.processing },
    { key: "completed", label: "Completed", count: counts.completed },
    { key: "failed", label: "Failed", count: counts.failed },
  ];

  return (
    <SidebarInset>
      <AppHeader title="Deploy Queue" />
      <div className="flex-1 space-y-6 p-6 md:p-8 overflow-y-auto">
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm dark:bg-red-950/40 dark:border-red-900 dark:text-red-300">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {/* ── Stats row ── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <ListOrdered className="size-4" />
                Total Queued
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                {stats?.totalQueued ?? (loading ? "…" : 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                menunggu eksekusi
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-teal-600" />
                Processing Now
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-teal-600 tabular-nums">
                {stats?.processingNow ?? (loading ? "…" : 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                sedang dideploy
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Completed Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-emerald-600 tabular-nums">
                {stats?.completedToday ?? (loading ? "…" : 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                selesai hari ini
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="size-4 text-cyan-600" />
                Scheduled Next 24h
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-cyan-600 tabular-nums">
                {stats?.scheduledNext24h ?? (loading ? "…" : 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                terjadwal 24 jam ke depan
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Action buttons row ── */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleScheduleAll}
            disabled={busy}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Calendar className="size-4" />
            Schedule All
          </Button>
          <Button
            onClick={handleBulkAddClick}
            disabled={busy}
            variant="outline"
          >
            <ListOrdered className="size-4" />
            Bulk Add Domains
          </Button>
          {busy && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              working…
            </span>
          )}
        </div>

        {/* ── Filter chips ── */}
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => {
            const active = filter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                className={[
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1.5",
                  active
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-transparent text-muted-foreground border-border hover:bg-muted hover:text-foreground",
                ].join(" ")}
              >
                <span>{c.label}</span>
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Queue table ── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Queue Items
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                {filteredQueue.length} of {queue.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Loading…
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No domains in queue. Add via Bulk Add or domain detail page.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Priority</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Server</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Attempted</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQueue.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono tabular-nums text-xs">
                        {item.priority}
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.domain?.name ?? (
                          <span className="text-muted-foreground italic">
                            (missing)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {item.domain?.url ? <UrlLink href={item.domain.url} truncate={50} /> : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.server?.label ?? (
                          <span className="text-muted-foreground italic">
                            unassigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(item.scheduledAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(item.attemptedAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(item.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(item.domainId)}
                          disabled={busy}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}
