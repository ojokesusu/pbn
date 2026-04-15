"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Server as ServerIcon,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { useConfirm } from "@/components/ui/confirm-modal"
import { useAdminGuard } from "@/hooks/use-me"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

interface Server {
  id: string
  label: string
  name: string
  nameserver2: string
  host: string
  username: string
  port: number
  status: string
  createdAt: string
  _count: { domains: number }
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: "Aktif",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  },
  inactive: {
    label: "Nonaktif",
    className: "bg-red-500/15 text-red-400 border-red-500/25",
  },
  error: {
    label: "Error",
    className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  },
}

type SyncReport = {
  stats: {
    serversTotal: number
    serversUpdated: number
    serversUnchanged: number
    serversSkipped: number
    domainsChecked: number
    zonesActive: number
    zonesPending: number
    zonesNotFound: number
    zonesOtherStatus: Record<string, number>
  }
  details: Array<{
    serverName: string
    serverHost: string
    domain: string
    zoneStatus: string
    nsBefore: string
    nsAfter: string
    changed: boolean
  }>
}

export default function ServersPage() {
  const router = useRouter()
  const confirm = useConfirm()
  const { isAdmin, loading: meLoading } = useAdminGuard()
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncReport, setSyncReport] = useState<SyncReport | null>(null)
  const [syncDialogOpen, setSyncDialogOpen] = useState(false)
  const [serverToDelete, setServerToDelete] = useState<Server | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const perPage = 25

  const filtered = servers.filter((s) => {
    if (statusFilter && s.status !== statusFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (s.label ?? "").toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.host.toLowerCase().includes(q)
    )
  })
  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  useEffect(() => {
    fetchServers()
  }, [])

  async function fetchServers() {
    try {
      const res = await fetch("/api/servers")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setServers(data)
    } catch (error) {
      console.error("Failed to fetch servers:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSyncCloudflare() {
    const ok = await confirm({
      title: "Sync dari Cloudflare?",
      message:
        `Sistem akan pull semua zone dari Cloudflare API lalu update nameserver setiap server berdasarkan data real.\n\n` +
        `Juga akan laporkan berapa zone active / pending / tidak ditemukan.\n\n` +
        `Proses: ~30-60 detik untuk ${servers.length} server.`,
      confirmText: "Jalankan Sync",
    })
    if (!ok) return

    setSyncing(true)
    setSyncReport(null)
    try {
      const res = await fetch("/api/servers/sync-cloudflare", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        await confirm({ title: "Sync gagal", message: data.error || "Unknown error", confirmText: "OK" })
        return
      }
      setSyncReport(data)
      setSyncDialogOpen(true)
      // Refresh server list to show updated names
      fetchServers()
    } catch (err) {
      await confirm({ title: "Koneksi bermasalah", message: String(err).substring(0, 200), confirmText: "OK" })
    } finally {
      setSyncing(false)
    }
  }

  async function handleDelete() {
    if (!serverToDelete) return
    setDeleting(serverToDelete.id)
    try {
      const res = await fetch(`/api/servers/${serverToDelete.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("Failed to delete")
      setServers((prev) => prev.filter((s) => s.id !== serverToDelete.id))
    } catch (error) {
      console.error("Failed to delete server:", error)
    } finally {
      setDeleting(null)
      setDeleteDialogOpen(false)
      setServerToDelete(null)
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Belum pernah"
    return new Date(dateStr).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (meLoading || !isAdmin) {
    return (
      <SidebarInset>
        <AppHeader title="Server" />
        <div className="flex-1 p-6" style={{ background: "var(--background)", minHeight: "100vh" }} />
      </SidebarInset>
    )
  }

  return (
    <SidebarInset>
      <AppHeader title="Server" />
      <div className="flex-1 space-y-6 p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Server</h2>
            <p style={{ color: "var(--muted-foreground)" }}>
              Kelola server cPanel untuk jaringan PBN Anda.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={handleSyncCloudflare}
              disabled={syncing}
              className="rounded-lg shadow-lg"
              style={{
                background: "linear-gradient(135deg, #f6821f, #f38020)",
                color: "#ffffff",
                border: "none",
              }}
              title="Sync nameserver dari Cloudflare API — update data stale"
            >
              {syncing ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Cloud className="size-4 mr-1" />
                  Sync Cloudflare
                </>
              )}
            </Button>
            <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20 transition-all" onClick={() => router.push("/servers/new")}>
              <Plus className="h-4 w-4 mr-1" />
              Tambah Server
            </Button>
          </div>
        </div>

        <Card className="rounded-xl border shadow-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: "var(--foreground)" }}>
              <ServerIcon className="size-5" style={{ color: "#0ea5e9" }} />
              Semua Server
            </CardTitle>
            <CardDescription style={{ color: "var(--muted-foreground)" }}>
              {loading
                ? "Memuat server..."
                : `${servers.length} server terdaftar`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!loading && servers.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--muted-foreground)" }} />
                  <Input
                    placeholder="Cari label, nameserver, IP..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                    className="pl-10 rounded-lg"
                    style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
                  className="h-9 rounded-lg border px-3 text-sm"
                  style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                >
                  <option value="">Status: Semua ({servers.length})</option>
                  <option value="active">Aktif ({servers.filter(s => s.status === "active").length})</option>
                  <option value="inactive">Nonaktif ({servers.filter(s => s.status === "inactive").length})</option>
                  <option value="error">Error ({servers.filter(s => s.status === "error").length})</option>
                </select>
                {(search || statusFilter) && (
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    {filtered.length} hasil
                  </span>
                )}
              </div>
            )}
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" style={{ background: "var(--muted)" }} />
                ))}
              </div>
            ) : servers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ServerIcon className="size-12" style={{ color: "rgba(14,165,233,0.3)" }} />
                <h3 className="mt-4 text-lg font-semibold" style={{ color: "var(--foreground)" }}>Belum ada server</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  Mulai dengan menambahkan server pertama Anda.
                </p>
                <Button className="mt-4 bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg" onClick={() => router.push("/servers/new")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Tambah Server
                </Button>
              </div>
            ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow className="border-b" style={{ borderColor: "var(--border)" }}>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Label</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Nameserver</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-center py-4" style={{ color: "var(--muted-foreground)" }}>Domain</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider py-4" style={{ color: "var(--muted-foreground)" }}>Status</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider text-right py-4" style={{ color: "var(--muted-foreground)" }}>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((server) => {
                    const status = statusConfig[server.status] ?? statusConfig.inactive
                    return (
                      <TableRow key={server.id} className="transition-colors border-b" style={{ borderColor: "var(--border)" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(14,165,233,0.04)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                        <TableCell className="font-medium py-4" style={{ color: "var(--secondary-foreground)" }}>
                          <Link
                            href={`/servers/${server.id}`}
                            className="hover:underline font-mono"
                            style={{ color: "#0ea5e9" }}
                          >
                            {server.label || "Server-???"}
                          </Link>
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="font-mono text-xs" style={{ color: "var(--muted-foreground)" }}>
                            <div>{server.name || "—"}</div>
                            {server.nameserver2 && <div>{server.nameserver2}</div>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center py-4" style={{ color: "var(--secondary-foreground)" }}>
                          {server._count.domains}
                        </TableCell>
                        <TableCell className="py-4">
                          <Badge
                            variant="outline"
                            className={status.className}
                          >
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right py-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="hover:bg-[rgba(14,165,233,0.1)]"
                              style={{ color: "var(--muted-foreground)" }}
                              onClick={() => router.push(`/servers/${server.id}`)}
                            >
                              <Pencil />
                              <span className="sr-only">Edit</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => {
                                setServerToDelete(server)
                                setDeleteDialogOpen(true)
                              }}
                            >
                              <Trash2 />
                              <span className="sr-only">Hapus</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                    Menampilkan {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} dari {filtered.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                      <ChevronLeft className="size-4" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let page: number
                      if (totalPages <= 7) { page = i + 1 }
                      else if (currentPage <= 4) { page = i + 1 }
                      else if (currentPage >= totalPages - 3) { page = totalPages - 6 + i }
                      else { page = currentPage - 3 + i }
                      return (
                        <Button key={page} variant={currentPage === page ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(page)} className={`h-8 w-8 p-0 ${currentPage === page ? "bg-[#0ea5e9] text-white hover:bg-[#0284c7]" : ""}`} style={currentPage !== page ? { borderColor: "var(--border)", color: "var(--secondary-foreground)" } : {}}>
                          {page}
                        </Button>
                      )
                    })}
                    <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
            )}
          </CardContent>
        </Card>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="rounded-xl border" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <DialogHeader>
              <DialogTitle style={{ color: "var(--foreground)" }}>Hapus Server</DialogTitle>
              <DialogDescription style={{ color: "var(--muted-foreground)" }}>
                Apakah Anda yakin ingin menghapus server{" "}
                <span className="font-semibold font-mono" style={{ color: "var(--foreground)" }}>
                  {serverToDelete?.label || serverToDelete?.name}
                </span>
                ? Tindakan ini tidak dapat dibatalkan. Semua domain
                yang terkait dengan server ini juga akan terpengaruh.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" className="border-[color:var(--border)] hover:bg-[color:var(--muted)]" style={{ color: "var(--muted-foreground)" }} onClick={() => setDeleteDialogOpen(false)}>
                Batal
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting !== null}
              >
                {deleting ? (
                  <>
                    <Loader2 className="animate-spin" data-icon="inline-start" />
                    Menghapus...
                  </>
                ) : (
                  "Hapus"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cloudflare Sync Report Dialog */}
        <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
          <DialogContent className="rounded-xl max-w-[720px] max-h-[85vh] overflow-hidden flex flex-col" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2" style={{ color: "var(--foreground)" }}>
                <Cloud className="size-5" style={{ color: "#f6821f" }} />
                Hasil Sync Cloudflare
              </DialogTitle>
              <DialogDescription style={{ color: "var(--muted-foreground)" }}>
                Ringkasan update nameserver dari Cloudflare API
              </DialogDescription>
            </DialogHeader>

            {syncReport && (
              <div className="flex-1 overflow-y-auto space-y-4 -mx-1 px-1">
                {/* Top stats grid */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-lg border p-3 text-center" style={{ background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.25)" }}>
                    <div className="text-2xl font-extrabold" style={{ color: "#10b981" }}>{syncReport.stats.serversUpdated}</div>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Server Updated</div>
                  </div>
                  <div className="rounded-lg border p-3 text-center" style={{ background: "rgba(14,165,233,0.08)", borderColor: "rgba(14,165,233,0.25)" }}>
                    <div className="text-2xl font-extrabold" style={{ color: "#0ea5e9" }}>{syncReport.stats.zonesActive}</div>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Zone Active</div>
                  </div>
                  <div className="rounded-lg border p-3 text-center" style={{ background: "rgba(245,158,11,0.08)", borderColor: "rgba(245,158,11,0.25)" }}>
                    <div className="text-2xl font-extrabold" style={{ color: "#f59e0b" }}>{syncReport.stats.zonesPending}</div>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Pending</div>
                  </div>
                  <div className="rounded-lg border p-3 text-center" style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)" }}>
                    <div className="text-2xl font-extrabold" style={{ color: "#ef4444" }}>{syncReport.stats.zonesNotFound}</div>
                    <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Not in CF</div>
                  </div>
                </div>

                {/* Summary text */}
                <div className="rounded-lg border p-3 text-sm" style={{ background: "var(--muted)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                  <div className="flex justify-between mb-1">
                    <span>Total server dicek:</span>
                    <span className="font-bold">{syncReport.stats.domainsChecked} / {syncReport.stats.serversTotal}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Unchanged (sudah benar):</span>
                    <span className="font-bold">{syncReport.stats.serversUnchanged}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Skipped (no domain attached):</span>
                    <span className="font-bold">{syncReport.stats.serversSkipped}</span>
                  </div>
                  {Object.entries(syncReport.stats.zonesOtherStatus).length > 0 && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
                      <div className="text-[11px] mb-1" style={{ color: "var(--muted-foreground)" }}>Zone status lainnya:</div>
                      {Object.entries(syncReport.stats.zonesOtherStatus).map(([status, count]) => (
                        <div key={status} className="flex justify-between text-xs">
                          <span className="capitalize">{status}</span>
                          <span>{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Details table (changes only) */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
                    Detail Perubahan ({syncReport.details.filter(d => d.changed).length} server)
                  </h4>
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)" }}>
                    <div className="max-h-[280px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0" style={{ background: "var(--background)" }}>
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--muted-foreground)" }}>Domain</th>
                            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--muted-foreground)" }}>Status</th>
                            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--muted-foreground)" }}>NS Sebelum</th>
                            <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--muted-foreground)" }}>NS Sesudah</th>
                          </tr>
                        </thead>
                        <tbody>
                          {syncReport.details.filter(d => d.changed || d.zoneStatus === "not-in-cloudflare").slice(0, 100).map((d, i) => (
                            <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                              <td className="px-3 py-1.5 font-mono text-[10px]" style={{ color: "var(--foreground)" }}>{d.domain}</td>
                              <td className="px-3 py-1.5">
                                {d.zoneStatus === "active" ? (
                                  <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "#10b981" }}>
                                    <CheckCircle2 className="size-3" />active
                                  </span>
                                ) : d.zoneStatus === "not-in-cloudflare" ? (
                                  <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "#ef4444" }}>
                                    <AlertTriangle className="size-3" />missing
                                  </span>
                                ) : (
                                  <span className="text-[10px]" style={{ color: "#f59e0b" }}>{d.zoneStatus}</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5 font-mono text-[10px] truncate max-w-[160px]" style={{ color: "var(--muted-foreground)" }}>{d.nsBefore}</td>
                              <td className="px-3 py-1.5 font-mono text-[10px] truncate max-w-[160px]" style={{ color: d.changed ? "#10b981" : "var(--muted-foreground)" }}>{d.nsAfter}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {syncReport.details.filter(d => d.changed || d.zoneStatus === "not-in-cloudflare").length > 100 && (
                    <p className="text-[10px] mt-1" style={{ color: "var(--muted-foreground)" }}>
                      (menampilkan 100 perubahan pertama — total {syncReport.details.filter(d => d.changed).length} updated)
                    </p>
                  )}
                </div>

                {/* Actionable insight */}
                {syncReport.stats.zonesNotFound > 0 && (
                  <div className="rounded-lg border px-3 py-2" style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)" }}>
                    <div className="flex items-start gap-2 text-xs" style={{ color: "var(--secondary-foreground)" }}>
                      <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
                      <div>
                        <b>{syncReport.stats.zonesNotFound} domain tidak ditemukan di Cloudflare.</b>
                        {" "}Ini kemungkinan domain yang belum di-add ke Cloudflare account kamu, atau sudah dihapus.
                        Domain-domain ini kemungkinan besar jadi "dead" di Health Check.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => setSyncDialogOpen(false)} className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg">
                Tutup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SidebarInset>
  )
}
