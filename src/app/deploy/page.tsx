"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Rocket, Loader2, CheckCircle2, XCircle, Eye, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Domain {
  id: string;
  name: string;
  url: string;
  status: string;
  server: { host: string } | null;
}

interface DeployLog {
  id: string;
  action: string;
  status: string;
  filesChanged: number;
  message: string;
  deployedAt: string;
  domain: { id: string; name: string; url: string };
}

export default function DeployPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [logs, setLogs] = useState<DeployLog[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>("");
  const [deploying, setDeploying] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [logSearch, setLogSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const logPerPage = 25;

  const filteredLogs = logs.filter((l) => {
    if (!logSearch) return true;
    const q = logSearch.toLowerCase();
    return l.domain.name.toLowerCase().includes(q) || l.status.toLowerCase().includes(q) || l.message?.toLowerCase().includes(q);
  });
  const logTotalPages = Math.ceil(filteredLogs.length / logPerPage);
  const paginatedLogs = filteredLogs.slice((logPage - 1) * logPerPage, logPage * logPerPage);

  useEffect(() => {
    Promise.all([
      fetch("/api/domains").then((r) => r.json()),
      fetch("/api/deploy").then((r) => r.json()),
    ]).then(([d, l]) => {
      setDomains(d);
      setLogs(l);
      setLoading(false);
    });
  }, []);

  const handleDeploy = async (domainId: string) => {
    setDeploying(domainId);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId }),
      });
      const data = await res.json();
      if (data.success) {
        // Refresh logs
        const logsRes = await fetch("/api/deploy");
        setLogs(await logsRes.json());
      } else {
        alert("Deploy gagal: " + (data.error || "Unknown error"));
      }
    } catch {
      alert("Permintaan deploy gagal");
    } finally {
      setDeploying(null);
    }
  };

  const handlePreview = async (domainId: string) => {
    setPreviewing(domainId);
    try {
      const res = await fetch("/api/deploy/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domainId }),
      });
      const data = await res.json();
      if (data.preview) {
        setPreviewHtml(data.preview);
      } else {
        alert("Pratinjau gagal: " + (data.error || "No content"));
      }
    } catch {
      alert("Permintaan pratinjau gagal");
    } finally {
      setPreviewing(null);
    }
  };

  return (
    <SidebarInset>
      <AppHeader title="Deploy" />
      <div className="p-6 space-y-6">
        {/* Bulk Deploy Banner */}
        <Link href="/deploy/bulk">
          <div className="rounded-xl border p-5 shadow-sm transition-all hover:shadow-md cursor-pointer" style={{ background: "linear-gradient(135deg, #0ea5e9, #0284c7)", borderColor: "transparent" }}>
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center size-12 rounded-xl bg-white/20">
                  <Zap className="size-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Bulk Deploy → Semua Domain Sekaligus</h3>
                  <p className="text-sm opacity-90">Deploy 259 PBN sites ke cPanel dalam 1 klik</p>
                </div>
              </div>
              <span className="text-2xl">→</span>
            </div>
          </div>
        </Link>

        {/* Deploy Controls */}
        <Card className="bg-white border-[color:var(--border)] rounded-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[color:var(--foreground)]">
              <Rocket className="h-5 w-5 text-[#0ea5e9]" />
              Deploy Situs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Select value={selectedDomain} onValueChange={(val) => setSelectedDomain(val ?? "")}>
                <SelectTrigger className="w-[300px] bg-[color:var(--muted)] border-[color:var(--border)] text-[color:var(--secondary-foreground)]">
                  <SelectValue placeholder="Pilih domain untuk di-deploy" />
                </SelectTrigger>
                <SelectContent className="bg-[color:var(--muted)] border-[color:var(--border)]">
                  {domains.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.url})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => selectedDomain && handlePreview(selectedDomain)}
                variant="outline"
                disabled={!selectedDomain || previewing !== null}
                className="bg-[color:var(--muted)] border-[color:var(--border)] hover:border-[#0ea5e9]/30 text-[color:var(--secondary-foreground)]"
              >
                {previewing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                Pratinjau
              </Button>
              <Button
                onClick={() => selectedDomain && handleDeploy(selectedDomain)}
                disabled={!selectedDomain || deploying !== null}
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
              >
                {deploying ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4 mr-2" />
                )}
                Deploy
              </Button>
            </div>
            {!domains.some((d) => d.id === selectedDomain && d.server?.host) &&
              selectedDomain && (
                <p className="text-sm text-amber-400 mt-2">
                  Server belum dikonfigurasi untuk domain ini. File hanya akan dibuat secara lokal.
                </p>
              )}
          </CardContent>
        </Card>

        {/* Preview */}
        {previewHtml && (
          <Card className="bg-white border-[color:var(--border)] rounded-xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-[color:var(--foreground)]">Pratinjau Situs</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setPreviewHtml("")} className="text-[color:var(--muted-foreground)] hover:text-[color:var(--secondary-foreground)]">
                  Tutup
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border border-[color:var(--border)] rounded-lg overflow-hidden">
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-[600px] bg-white"
                  title="Pratinjau Situs"
                  sandbox="allow-same-origin"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Deploy History */}
        <Card className="bg-white border-[color:var(--border)] rounded-xl">
          <CardHeader>
            <CardTitle className="text-[color:var(--foreground)]">Riwayat Deploy</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length > 0 && (
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--muted-foreground)" }} />
                  <Input
                    placeholder="Cari domain, status..."
                    value={logSearch}
                    onChange={(e) => { setLogSearch(e.target.value); setLogPage(1) }}
                    className="pl-10 rounded-lg"
                    style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  />
                </div>
              </div>
            )}
            {loading ? (
              <div className="p-8 text-center text-[color:var(--muted-foreground)]">Memuat...</div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center text-[color:var(--muted-foreground)]">
                Belum ada deployment. Pilih domain dan klik Deploy untuk memulai
              </div>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow className="border-[color:var(--border)] hover:bg-transparent">
                    <TableHead className="text-[color:var(--muted-foreground)]">Domain</TableHead>
                    <TableHead className="text-[color:var(--muted-foreground)]">Aksi</TableHead>
                    <TableHead className="text-[color:var(--muted-foreground)]">Status</TableHead>
                    <TableHead className="text-[color:var(--muted-foreground)]">File</TableHead>
                    <TableHead className="text-[color:var(--muted-foreground)]">Pesan</TableHead>
                    <TableHead className="text-[color:var(--muted-foreground)]">Tanggal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLogs.map((log) => (
                    <TableRow key={log.id} className="border-[color:var(--border)] hover:bg-[color:var(--muted)]/50">
                      <TableCell className="font-medium">
                        <Link
                          href={`/domains/${log.domain.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[color:var(--foreground)] hover:text-[color:var(--primary)] hover:underline"
                        >
                          {log.domain.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-[color:var(--border)] text-[color:var(--muted-foreground)]">{log.action}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`flex items-center gap-1 w-fit border-transparent ${
                            log.status === "success"
                              ? "bg-green-500/15 text-green-400"
                              : log.status === "failed"
                              ? "bg-red-500/15 text-red-400"
                              : "bg-[#0ea5e9]/15 text-[#0ea5e9]"
                          }`}
                        >
                          {log.status === "success" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : log.status === "failed" ? (
                            <XCircle className="h-3 w-3" />
                          ) : (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[color:var(--secondary-foreground)]">{log.filesChanged}</TableCell>
                      <TableCell className="max-w-[300px] truncate text-[color:var(--muted-foreground)]">
                        {log.message}
                      </TableCell>
                      <TableCell className="text-[color:var(--muted-foreground)]">
                        {new Date(log.deployedAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {logTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                    Menampilkan {(logPage - 1) * logPerPage + 1}–{Math.min(logPage * logPerPage, filteredLogs.length)} dari {filteredLogs.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={logPage <= 1} onClick={() => setLogPage(p => p - 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                      <ChevronLeft className="size-4" />
                    </Button>
                    {Array.from({ length: Math.min(logTotalPages, 7) }, (_, i) => {
                      let page: number;
                      if (logTotalPages <= 7) { page = i + 1 }
                      else if (logPage <= 4) { page = i + 1 }
                      else if (logPage >= logTotalPages - 3) { page = logTotalPages - 6 + i }
                      else { page = logPage - 3 + i }
                      return (
                        <Button key={page} variant={logPage === page ? "default" : "outline"} size="sm" onClick={() => setLogPage(page)} className={`h-8 w-8 p-0 ${logPage === page ? "bg-[#0ea5e9] text-white hover:bg-[#0284c7]" : ""}`} style={logPage !== page ? { borderColor: "var(--border)", color: "var(--secondary-foreground)" } : {}}>
                          {page}
                        </Button>
                      );
                    })}
                    <Button variant="outline" size="sm" disabled={logPage >= logTotalPages} onClick={() => setLogPage(p => p + 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                      <ChevronRight className="size-4" />
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
