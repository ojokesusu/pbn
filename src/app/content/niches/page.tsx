"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Search, X } from "lucide-react";

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

type NicheMapping = {
  domainId: string;
  domain: string;
  niche: string | null;
  updatedAt: string | null;
};

const PAGE_SIZE = 50;

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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/content/niche-mapping");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setItems(Array.isArray(data) ? data : (data.items ?? []));
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.domain.toLowerCase().includes(q) ||
        (it.niche || "").toLowerCase().includes(q),
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
                              {it.domain}
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
    </SidebarInset>
  );
}
