"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Rss as RssIcon } from "lucide-react";

import { SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type RssSource = {
  id: string;
  url: string;
  niche: string;
  type: string;
  active: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
  itemCount: number;
  createdAt: string | null;
};

type TypeFilter = "Semua" | "RSS" | "API" | "Scraper";

function TypeBadge({ type }: { type: string }) {
  const t = (type || "").toLowerCase();
  if (t === "rss") {
    return (
      <Badge
        variant="outline"
        className="bg-blue-500/10 text-blue-600 border-blue-300"
      >
        RSS
      </Badge>
    );
  }
  if (t === "api") {
    return (
      <Badge
        variant="outline"
        className="bg-amber-500/10 text-amber-600 border-amber-300"
      >
        API
      </Badge>
    );
  }
  if (t === "scraper") {
    return (
      <Badge
        variant="outline"
        className="bg-purple-500/10 text-purple-600 border-purple-300"
      >
        Scraper
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground">
      {type || "-"}
    </Badge>
  );
}

export default function RssSourcesPage() {
  const [items, setItems] = useState<RssSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("Semua");
  const [search, setSearch] = useState("");

  // Add form state
  const [newUrl, setNewUrl] = useState("");
  const [newNiche, setNewNiche] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const res = await fetch("/api/content/rss-sources");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const raw: Array<Record<string, unknown>> = Array.isArray(data)
        ? data
        : ((data.items as Array<Record<string, unknown>>) ?? []);
      const normalized: RssSource[] = raw.map((r) => ({
        id: String(r.id ?? ""),
        url: String(r.url ?? ""),
        niche: typeof r.niche === "string" ? r.niche : "",
        type: typeof r.type === "string" ? r.type : "rss",
        active: typeof r.active === "boolean" ? r.active : true,
        lastFetchedAt:
          typeof r.lastFetched === "string"
            ? r.lastFetched
            : typeof r.lastFetchedAt === "string"
              ? r.lastFetchedAt
              : null,
        lastError:
          typeof r.lastError === "string" ? r.lastError : null,
        itemCount: typeof r.itemCount === "number" ? r.itemCount : 0,
        createdAt:
          typeof r.createdAt === "string" ? r.createdAt : null,
      }));
      setItems(normalized);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!newUrl.trim() || !newNiche.trim()) {
      window.alert("Peringatan\nIsi URL & niche dulu.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/content/rss-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newUrl.trim(), niche: newNiche.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewUrl("");
      setNewNiche("");
      window.alert("Berhasil tambah RSS source.");
      await load();
    } catch (e) {
      window.alert(
        `Gagal tambah RSS\n${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(it: RssSource) {
    setBusy((s) => ({ ...s, [it.id]: true }));
    const nextActive = !it.active;
    try {
      const res = await fetch(`/api/content/rss-sources/${it.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setItems((prev) =>
        prev.map((x) =>
          x.id === it.id ? { ...x, active: nextActive } : x,
        ),
      );
    } catch (e) {
      window.alert(
        `Gagal toggle\n${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setBusy((s) => ({ ...s, [it.id]: false }));
    }
  }

  async function handleDelete(it: RssSource) {
    if (!window.confirm(`Hapus RSS: ${it.url}?`)) return;
    setBusy((s) => ({ ...s, [it.id]: true }));
    try {
      const res = await fetch(`/api/content/rss-sources/${it.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      window.alert("Berhasil hapus RSS source.");
    } catch (e) {
      window.alert(
        `Gagal hapus\n${e instanceof Error ? e.message : "Unknown error"}`,
      );
    } finally {
      setBusy((s) => ({ ...s, [it.id]: false }));
    }
  }

  return (
    <SidebarInset>
      <AppHeader title="Sumber Konten" />
      <div className="flex-1 space-y-6 p-6 md:p-8 overflow-y-auto">
        <div>
          <h2 className="text-lg font-semibold">Sumber Konten</h2>
          <p className="text-xs text-muted-foreground">
            Kelola feed RSS yang jadi sumber artikel sebelum AI rewrite.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 text-red-700 px-4 py-3 text-sm">
            <span className="font-semibold">Error:</span> {error}
          </div>
        )}

        {/* Add form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="size-4" /> Tambah RSS Source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[280px]">
                <label className="text-xs text-muted-foreground mb-1 block">
                  URL Feed
                </label>
                <Input
                  placeholder="https://example.com/feed.xml"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                />
              </div>
              <div className="w-40">
                <label className="text-xs text-muted-foreground mb-1 block">
                  Niche
                </label>
                <Input
                  placeholder="ex: tech"
                  value={newNiche}
                  onChange={(e) => setNewNiche(e.target.value)}
                />
              </div>
              <Button onClick={handleAdd} disabled={adding}>
                <Plus className="size-4" />
                {adding ? "Menambahkan..." : "Tambah"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RssIcon className="size-4" />
              {(() => {
                const typed =
                  typeFilter === "Semua"
                    ? items
                    : items.filter(
                        (x) => x.type === typeFilter.toLowerCase(),
                      );
                const q = search.trim().toLowerCase();
                const visible = q
                  ? typed.filter(
                      (x) =>
                        x.url.toLowerCase().includes(q) ||
                        x.niche.toLowerCase().includes(q),
                    )
                  : typed;
                return (
                  <span>
                    {visible.length} of {typed.length} sources
                  </span>
                );
              })()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tab filter + search */}
            <div className="flex flex-wrap items-center gap-3">
              <Tabs
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v as TypeFilter)}
              >
                <TabsList>
                  <TabsTrigger value="Semua">Semua</TabsTrigger>
                  <TabsTrigger value="RSS">RSS</TabsTrigger>
                  <TabsTrigger value="API">API</TabsTrigger>
                  <TabsTrigger value="Scraper">Scraper</TabsTrigger>
                </TabsList>
              </Tabs>
              <Input
                placeholder="Cari URL / niche..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {loading && items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Loading...
              </p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Belum ada RSS source.
              </p>
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Niche</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead>Last Fetched</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items
                      .filter((it) =>
                        typeFilter === "Semua"
                          ? true
                          : it.type === typeFilter.toLowerCase(),
                      )
                      .filter((it) => {
                        const q = search.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          it.url.toLowerCase().includes(q) ||
                          it.niche.toLowerCase().includes(q)
                        );
                      })
                      .map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-mono text-xs max-w-[360px] truncate">
                          <a
                            href={it.url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {it.url}
                          </a>
                          {it.lastError && (
                            <div className="text-[10px] text-red-600 mt-0.5 truncate">
                              {it.lastError}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-cyan-500 text-white hover:bg-cyan-500">
                            {it.niche || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TypeBadge type={it.type} />
                        </TableCell>
                        <TableCell>
                          {it.active ? (
                            <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">
                              enabled
                            </Badge>
                          ) : (
                            <Badge className="bg-muted text-muted-foreground hover:bg-muted">
                              disabled
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {it.itemCount}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {it.lastFetchedAt
                            ? new Date(it.lastFetchedAt).toLocaleString()
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={busy[it.id]}
                              onClick={() => handleToggle(it)}
                            >
                              {it.active ? "Disable" : "Enable"}
                            </Button>
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={busy[it.id]}
                              onClick={() => handleDelete(it)}
                            >
                              <Trash2 className="size-3 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  );
}
