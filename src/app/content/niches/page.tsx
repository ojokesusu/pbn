"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, Search, Shuffle, X } from "lucide-react";

import { SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type NicheMapping = {
  domainId: string;
  domain: { id: string; name: string; url: string; genre?: string } | null;
  niche: string | null;
  updatedAt: string | null;
};

const PAGE_SIZE = 50;

const DEFAULT_TARGET_NICHES = [
  "news",
  "politik",
  "kriminal",
  "hukum",
  "ekonomi",
  "hiburan",
  "otomotif",
  "bola",
  "gaming",
  "properti",
  "karir",
  "parenting",
  "fashion",
  "beauty",
  "religion",
  "tech",
  "health",
  "food",
] as const;

type RedistributePreviewItem = { niche: string; count: number };
type RedistributeResponse = {
  total?: number;
  totalRedistributed?: number;
  perNiche?: Record<string, number>;
  failureCount?: number;
  failures?: Array<{ batchStart: number; error: string }>;
  sampleTransitions?: Array<{ domainId: string; from: string; to: string; url: string }>;
  dryRun?: boolean;
  [key: string]: unknown;
};

function nicheBadgeStyle(niche: string | null): string {
  const n = (niche || "").toLowerCase();
  if (!n) return "bg-muted text-muted-foreground hover:bg-muted";
  if (n.includes("tech")) return "bg-cyan-500 text-white hover:bg-cyan-500";
  if (n.includes("health")) return "bg-emerald-500 text-white hover:bg-emerald-500";
  if (n.includes("finance")) return "bg-amber-500 text-white hover:bg-amber-500";
  if (n.includes("travel")) return "bg-pink-500 text-white hover:bg-pink-500";
  if (n.includes("food")) return "bg-red-500 text-white hover:bg-red-500";
  if (n.includes("crypto")) return "bg-purple-500 text-white hover:bg-purple-500";
  return "bg-teal-500 text-white hover:bg-teal-500";
}

export default function NicheMappingPage() {
  const [items, setItems] = useState<NicheMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);

  // Redistribute modal state
  const [redistOpen, setRedistOpen] = useState(false);
  const [targetNiches, setTargetNiches] = useState<string[]>([
    ...DEFAULT_TARGET_NICHES,
  ]);
  const [fallbackNiche, setFallbackNiche] = useState("news");
  const [redistLoading, setRedistLoading] = useState(false);
  const [redistPreview, setRedistPreview] =
    useState<RedistributeResponse | null>(null);
  const [redistError, setRedistError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/content/niche-mapping?pageSize=2000");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : (data.items ?? []));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) => {
        const domainStr = (it.domain?.url || it.domain?.name || "").toLowerCase();
        return (
          domainStr.includes(q) ||
          (it.niche || "").toLowerCase().includes(q)
        );
      },
    );
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  async function handleSave(domainId: string) {
    const value = editing[domainId];
    if (value === undefined) return;
    setSaving((s) => ({ ...s, [domainId]: true }));
    try {
      const res = await fetch("/api/content/niche-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId, niche: value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) =>
        prev.map((it) =>
          it.domainId === domainId
            ? { ...it, niche: value, updatedAt: new Date().toISOString() }
            : it,
        ),
      );
      setEditing((e) => {
        const next = { ...e };
        delete next[domainId];
        return next;
      });
      window.alert(`Berhasil simpan niche untuk domain.`);
    } catch (err) {
      window.alert(
        `Gagal simpan niche\n${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setSaving((s) => ({ ...s, [domainId]: false }));
    }
  }

  function toggleTargetNiche(niche: string) {
    setTargetNiches((prev) =>
      prev.includes(niche) ? prev.filter((n) => n !== niche) : [...prev, niche],
    );
  }

  async function runRedistribute(dryRun: boolean) {
    // API enforces >= 2 too — front-load the check so the user sees the rule
    // before a round-trip.
    if (targetNiches.length < 2) {
      setRedistError("Pilih minimal 2 target niche (round-robin butuh setidaknya 2).");
      return;
    }
    if (!fallbackNiche.trim()) {
      setRedistError("Fallback niche tidak boleh kosong.");
      return;
    }
    if (!dryRun) {
      const ok = window.confirm(
        `Apply redistribute domain dari "${fallbackNiche.trim()}" ke ${targetNiches.length} niche? Aksi ini akan mengubah niche di DB.`,
      );
      if (!ok) return;
    }
    setRedistLoading(true);
    setRedistError(null);
    try {
      const res = await fetch("/api/content/niche-mapping/redistribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetNiches,
          fallbackNiche: fallbackNiche.trim(),
          dryRun,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${txt ? ` - ${txt}` : ""}`);
      }
      const data: RedistributeResponse = await res.json();
      setRedistPreview({ ...data, dryRun });
      if (!dryRun) {
        const total =
          data.totalRedistributed ?? data.total ?? "unknown count";
        window.alert(`Redistribute selesai. Total: ${total} domain.`);
        await load();
      }
    } catch (err) {
      setRedistError(
        err instanceof Error ? err.message : "Gagal redistribute",
      );
    } finally {
      setRedistLoading(false);
    }
  }

  const previewEntries: RedistributePreviewItem[] = (() => {
    if (!redistPreview?.perNiche) return [];
    return Object.entries(redistPreview.perNiche).map(([niche, count]) => ({
      niche,
      count: Number(count) || 0,
    }));
  })();
  const failureCount = redistPreview?.failureCount ?? 0;

  return (
    <SidebarInset>
      <AppHeader title="Niche Mapping" />
      <div className="flex-1 space-y-6 p-6 md:p-8 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Niche Mapping</h2>
            <p className="text-xs text-muted-foreground">
              Map setiap domain ke niche untuk routing RSS &amp; prompt template.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Cari domain atau niche..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 w-64"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRedistPreview(null);
                setRedistError(null);
                setRedistOpen(true);
              }}
            >
              <Shuffle className="size-4" />
              Redistribute
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              {filtered.length} of {items.length} domains
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Loading...
              </p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Tidak ada data.
              </p>
            ) : (
              <>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Domain</TableHead>
                        <TableHead>Niche Saat Ini</TableHead>
                        <TableHead>Edit Niche</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paged.map((it) => {
                        const editValue =
                          editing[it.domainId] !== undefined
                            ? editing[it.domainId]
                            : (it.niche ?? "");
                        const dirty =
                          editing[it.domainId] !== undefined &&
                          editing[it.domainId] !== (it.niche ?? "");
                        return (
                          <TableRow key={it.domainId}>
                            <TableCell className="font-medium font-mono text-xs">
                              {it.domain?.url || it.domain?.name || "(unknown)"}
                            </TableCell>
                            <TableCell>
                              <Badge className={nicheBadgeStyle(it.niche)}>
                                {it.niche || "unmapped"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={editValue}
                                onChange={(e) =>
                                  setEditing((s) => ({
                                    ...s,
                                    [it.domainId]: e.target.value,
                                  }))
                                }
                                placeholder="ex: tech, health, finance"
                                className="h-7 text-xs w-48"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {dirty && (
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() =>
                                      setEditing((s) => {
                                        const next = { ...s };
                                        delete next[it.domainId];
                                        return next;
                                      })
                                    }
                                  >
                                    <X className="size-3" />
                                  </Button>
                                )}
                                <Button
                                  size="xs"
                                  variant={dirty ? "default" : "outline"}
                                  disabled={!dirty || saving[it.domainId]}
                                  onClick={() => handleSave(it.domainId)}
                                >
                                  <Save className="size-3" />
                                  {saving[it.domainId] ? "..." : "Simpan"}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <div className="tabular-nums">
                      Page {safePage} of {totalPages}
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
      </div>

      <Dialog open={redistOpen} onOpenChange={setRedistOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Redistribute Domains</DialogTitle>
            <DialogDescription>
              Bagi rata domain fallback ke niche pilihan (Opsi D)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Target niches ({targetNiches.length} selected)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_TARGET_NICHES.map((n) => {
                  const active = targetNiches.includes(n);
                  return (
                    <button
                      type="button"
                      key={n}
                      onClick={() => toggleTargetNiche(n)}
                      className={
                        "rounded-full border px-2.5 py-1 text-xs transition-colors " +
                        (active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground hover:bg-muted")
                      }
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Fallback niche (sumber yang dipindah)
              </label>
              <Input
                value={fallbackNiche}
                onChange={(e) => setFallbackNiche(e.target.value)}
                placeholder="news"
                className="h-8 text-xs"
              />
            </div>

            {redistError && (
              <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-xs">
                {redistError}
              </div>
            )}

            {redistPreview && (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {redistPreview.dryRun ? "Preview (Dry Run)" : "Applied"}
                  </span>
                  <span className="text-muted-foreground">
                    Total:{" "}
                    <span className="font-mono">
                      {redistPreview.totalRedistributed ??
                        redistPreview.total ??
                        previewEntries.reduce((a, b) => a + b.count, 0)}
                    </span>
                  </span>
                </div>
                {failureCount > 0 && (
                  <div className="rounded border border-red-300 bg-red-50 text-red-700 px-2 py-1 text-xs">
                    <span className="font-semibold">
                      {failureCount} batch gagal
                    </span>
                    <span className="ml-1 text-red-600/80">
                      (rows in failed batches stayed pada niche lama;
                      successful batches sudah ke-update).
                    </span>
                  </div>
                )}
                {previewEntries.length > 0 ? (
                  <div className="grid grid-cols-2 gap-1">
                    {previewEntries.map((e) => (
                      <div
                        key={e.niche}
                        className="flex items-center justify-between rounded bg-background px-2 py-1"
                      >
                        <span className="font-mono">{e.niche}</span>
                        <span className="tabular-nums font-semibold">
                          {e.count}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Tidak ada breakdown per niche dari response.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter showCloseButton>
            <Button
              variant="outline"
              size="sm"
              disabled={redistLoading}
              onClick={() => runRedistribute(true)}
            >
              {redistLoading ? "..." : "Preview (Dry Run)"}
            </Button>
            <Button
              size="sm"
              disabled={redistLoading}
              onClick={() => runRedistribute(false)}
            >
              {redistLoading ? "..." : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarInset>
  );
}
