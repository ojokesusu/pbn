"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowRight, CheckCircle2, Loader2, AlertCircle, Server as ServerIcon, Cloud, X } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useConfirm } from "@/components/ui/confirm-modal"

interface ServerLite {
  id: string
  label: string
  name: string
  host: string
  _count?: { domains: number }
}

interface DomainLite {
  id: string
  url: string
  serverId: string | null
}

interface SwitchResult {
  id: string
  url: string
  domain: string
  status: "success" | "failed"
  message: string
}

const CHUNK_SIZE = 10

interface BulkSwitchModalProps {
  open: boolean
  onClose: () => void
}

export function BulkSwitchModal({ open, onClose }: BulkSwitchModalProps) {
  const confirm = useConfirm()
  const [servers, setServers] = useState<ServerLite[]>([])
  const [domains, setDomains] = useState<DomainLite[]>([])
  const [loadingData, setLoadingData] = useState(false)

  const [fromServerId, setFromServerId] = useState<string>("")
  const [toServerId, setToServerId] = useState<string>("")
  const [proxied, setProxied] = useState<boolean>(true)

  const [phase, setPhase] = useState<"config" | "running" | "done">("config")
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [results, setResults] = useState<SwitchResult[]>([])
  const [error, setError] = useState<string | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (!open) return
    setPhase("config")
    setError(null)
    setResults([])
    setProgress({ current: 0, total: 0 })
    setLoadingData(true)
    Promise.all([
      fetch("/api/servers").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/domains").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([s, d]) => {
        if (Array.isArray(s)) setServers(s)
        if (Array.isArray(d)) setDomains(d.map((x: { id: string; url: string; serverId: string | null }) => ({ id: x.id, url: x.url, serverId: x.serverId })))
      })
      .catch(() => setError("Gagal load servers/domains"))
      .finally(() => setLoadingData(false))
  }, [open])

  // Domains grouped by source server
  const domainsByServer = useMemo(() => {
    const map = new Map<string, DomainLite[]>()
    for (const d of domains) {
      const key = d.serverId || "__none__"
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(d)
    }
    return map
  }, [domains])

  const selectedDomainIds = useMemo(() => {
    if (!fromServerId) return [] as string[]
    if (fromServerId === "__all__") return domains.map((d) => d.id)
    return (domainsByServer.get(fromServerId) || []).map((d) => d.id)
  }, [fromServerId, domains, domainsByServer])

  const fromServer = servers.find((s) => s.id === fromServerId)
  const toServer = servers.find((s) => s.id === toServerId)
  const summary = useMemo(() => {
    const success = results.filter((r) => r.status === "success").length
    const failed = results.filter((r) => r.status === "failed").length
    return { success, failed, total: results.length }
  }, [results])

  function close() {
    if (phase === "running") return // block close while running
    onClose()
  }

  async function startSwitch() {
    if (!toServerId) {
      setError("Pilih target server dulu")
      return
    }
    if (selectedDomainIds.length === 0) {
      setError("Tidak ada domain untuk dipindah")
      return
    }
    if (fromServerId === toServerId) {
      setError("Server asal & tujuan sama")
      return
    }

    const ok = await confirm({
      title: "Konfirmasi Bulk Switch",
      message:
        `${selectedDomainIds.length} domain akan dipindah ke server "${toServer?.label || toServer?.host}".\n\n` +
        `Cloudflare DNS akan otomatis diupdate ke IP ${toServer?.host} (proxy ${proxied ? "ON" : "OFF"}).\n\n` +
        `Estimasi: ~${Math.ceil((selectedDomainIds.length * 1.5) / 60)} menit. Tidak bisa di-cancel di tengah.`,
      confirmText: "Mulai Switch",
      cancelText: "Batal",
    })
    if (!ok) return

    setPhase("running")
    setError(null)
    setResults([])
    setProgress({ current: 0, total: selectedDomainIds.length })

    const allResults: SwitchResult[] = []
    try {
      for (let i = 0; i < selectedDomainIds.length; i += CHUNK_SIZE) {
        const chunk = selectedDomainIds.slice(i, i + CHUNK_SIZE)
        const isLast = i + CHUNK_SIZE >= selectedDomainIds.length
        const res = await fetch("/api/domains/bulk-switch-server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            domainIds: chunk,
            toServerId,
            proxied,
            lastChunk: isLast,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Bulk switch gagal di chunk ini, sebagian sudah berjalan")
          break
        }
        allResults.push(...(data.results || []))
        setResults([...allResults])
        setProgress({ current: Math.min(i + chunk.length, selectedDomainIds.length), total: selectedDomainIds.length })
      }
    } catch (err) {
      setError(`Network error: ${String(err).substring(0, 200)}`)
    } finally {
      setPhase("done")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close() }}>
      <DialogContent
        className="rounded-xl border sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        showCloseButton={phase !== "running"}
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl shrink-0" style={{ background: "rgba(14,165,233,0.1)" }}>
              <ServerIcon className="size-5" style={{ color: "#0ea5e9" }} />
            </div>
            <div>
              <DialogTitle style={{ color: "var(--foreground)" }}>Bulk Switch Server + Cloudflare</DialogTitle>
              <DialogDescription className="mt-1.5" style={{ color: "var(--muted-foreground)" }}>
                Pindahkan banyak domain ke server baru sekaligus, dan auto-update Cloudflare DNS.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 mt-2">
          {/* CONFIG PHASE */}
          {phase === "config" && (
            <div className="space-y-5">
              {loadingData ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin" style={{ color: "#0ea5e9" }} />
                  <span className="ml-2 text-sm" style={{ color: "var(--muted-foreground)" }}>Loading servers + domains...</span>
                </div>
              ) : (
                <>
                  {/* From server */}
                  <div>
                    <Label className="text-sm font-medium" style={{ color: "var(--secondary-foreground)" }}>Dari Server (Source)</Label>
                    <select
                      className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
                      value={fromServerId}
                      onChange={(e) => { setFromServerId(e.target.value); setError(null) }}
                    >
                      <option value="">— Pilih server asal —</option>
                      <option value="__all__">Semua domain ({domains.length})</option>
                      {servers.map((s) => {
                        const count = domainsByServer.get(s.id)?.length || 0
                        return (
                          <option key={s.id} value={s.id}>
                            {s.label || s.host} — {count} domain
                          </option>
                        )
                      })}
                    </select>
                  </div>

                  {/* Arrow */}
                  <div className="flex justify-center">
                    <ArrowRight className="size-5" style={{ color: "var(--muted-foreground)" }} />
                  </div>

                  {/* To server */}
                  <div>
                    <Label className="text-sm font-medium" style={{ color: "var(--secondary-foreground)" }}>Ke Server (Target)</Label>
                    <select
                      className="mt-1.5 w-full rounded-lg border px-3 py-2 text-sm outline-none"
                      style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
                      value={toServerId}
                      onChange={(e) => { setToServerId(e.target.value); setError(null) }}
                    >
                      <option value="">— Pilih server tujuan —</option>
                      {servers
                        .filter((s) => s.id !== fromServerId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label || s.host} ({s.host || "no IP"})
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Cloudflare proxy toggle */}
                  <div className="rounded-lg border p-3 flex items-start gap-3" style={{ background: "rgba(249,115,22,0.05)", borderColor: "rgba(249,115,22,0.2)" }}>
                    <Cloud className="size-5 shrink-0 mt-0.5" style={{ color: "#f97316" }} />
                    <div className="flex-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={proxied}
                          onChange={(e) => setProxied(e.target.checked)}
                        />
                        <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                          Cloudflare proxy ON (recommended)
                        </span>
                      </label>
                      <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                        Sembunyikan IP server di belakang Cloudflare — wajib untuk PBN dengan banyak domain di 1 IP.
                      </p>
                    </div>
                  </div>

                  {/* Summary preview */}
                  {fromServerId && toServerId && (
                    <div className="rounded-lg border p-4" style={{ background: "rgba(14,165,233,0.05)", borderColor: "rgba(14,165,233,0.25)" }}>
                      <p className="text-sm font-semibold mb-2" style={{ color: "#0ea5e9" }}>Preview Operasi</p>
                      <div className="flex items-center gap-2 flex-wrap text-sm" style={{ color: "var(--secondary-foreground)" }}>
                        <Badge className="bg-slate-500/15 text-slate-600 border-slate-500/25">
                          {selectedDomainIds.length} domain
                        </Badge>
                        <span>dari</span>
                        <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/25">
                          {fromServerId === "__all__" ? "Semua server" : fromServer?.label || fromServer?.host}
                        </Badge>
                        <ArrowRight className="size-4" />
                        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/25">
                          {toServer?.label || toServer?.host} ({toServer?.host})
                        </Badge>
                      </div>
                      <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
                        Estimasi: ~{Math.ceil((selectedDomainIds.length * 1.5) / 60)} menit · Cloudflare proxy: <strong>{proxied ? "ON" : "OFF"}</strong> · Chunk: {CHUNK_SIZE} domain/request
                      </p>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-lg border p-3 flex items-start gap-2" style={{ background: "rgba(239,68,68,0.1)", borderColor: "#fecaca" }}>
                      <AlertCircle className="size-4 mt-0.5 text-red-500 shrink-0" />
                      <p className="text-sm text-red-600">{error}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* RUNNING / DONE PHASES */}
          {(phase === "running" || phase === "done") && (
            <div className="space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium" style={{ color: "var(--secondary-foreground)" }}>
                    {phase === "running" ? "Switching..." : "Selesai"} {progress.current} / {progress.total} domain
                  </span>
                  <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                    {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                      background: phase === "done" && summary.failed === 0
                        ? "linear-gradient(90deg, #10b981, #059669)"
                        : "linear-gradient(90deg, #0ea5e9, #0284c7)",
                    }}
                  />
                </div>
              </div>

              {/* Summary badges */}
              {results.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/25">
                    <CheckCircle2 className="size-3 mr-1" /> {summary.success} success
                  </Badge>
                  {summary.failed > 0 && (
                    <Badge className="bg-red-500/15 text-red-600 border-red-500/25">
                      <X className="size-3 mr-1" /> {summary.failed} failed
                    </Badge>
                  )}
                </div>
              )}

              {/* Live results — failed first, then last 20 */}
              <div className="rounded-lg border max-h-72 overflow-y-auto" style={{ background: "var(--background)", borderColor: "var(--border)" }}>
                {results.length === 0 ? (
                  <div className="p-4 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
                    {phase === "running" ? "Menunggu hasil pertama..." : "Belum ada hasil"}
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {/* Show failed first */}
                    {results.filter((r) => r.status === "failed").map((r) => (
                      <div key={r.id} className="px-3 py-2 flex items-start gap-2 text-xs">
                        <X className="size-3.5 mt-0.5 text-red-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-mono truncate" style={{ color: "var(--foreground)" }}>{r.domain}</p>
                          <p className="text-red-600 mt-0.5">{r.message}</p>
                        </div>
                      </div>
                    ))}
                    {/* Then recent successes */}
                    {results.filter((r) => r.status === "success").slice(-15).reverse().map((r) => (
                      <div key={r.id} className="px-3 py-2 flex items-start gap-2 text-xs">
                        <CheckCircle2 className="size-3.5 mt-0.5 text-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-mono truncate" style={{ color: "var(--foreground)" }}>{r.domain}</p>
                          <p className="mt-0.5" style={{ color: "var(--muted-foreground)" }}>{r.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div className="rounded-lg border p-3 flex items-start gap-2" style={{ background: "rgba(239,68,68,0.1)", borderColor: "#fecaca" }}>
                  <AlertCircle className="size-4 mt-0.5 text-red-500 shrink-0" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="-mx-4 -mb-4 flex items-center justify-end gap-2 rounded-b-xl border-t bg-muted/40 p-4">
          {phase === "config" && (
            <>
              <Button variant="outline" className="rounded-lg" onClick={close}>Batal</Button>
              <Button
                className="rounded-lg shadow-lg"
                style={{ background: "#0ea5e9", color: "#fff", boxShadow: "0 4px 14px rgba(14,165,233,0.3)" }}
                disabled={loadingData || !fromServerId || !toServerId || selectedDomainIds.length === 0}
                onClick={startSwitch}
              >
                Mulai Switch ({selectedDomainIds.length})
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button disabled className="rounded-lg" style={{ background: "#0ea5e9", color: "#fff" }}>
              <Loader2 className="size-4 mr-1 animate-spin" />
              Processing...
            </Button>
          )}
          {phase === "done" && (
            <Button
              className="rounded-lg"
              style={{ background: "#0ea5e9", color: "#fff" }}
              onClick={close}
            >
              Tutup
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
