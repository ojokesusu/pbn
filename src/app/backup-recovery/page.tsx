"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DatabaseBackup, ShieldCheck, ShieldAlert, RefreshCw, Loader2, Download,
  RotateCcw, AlertTriangle, HardDriveDownload, Server as ServerIcon, Play, CheckCircle2, XCircle,
} from "lucide-react";
import { SidebarInset } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-modal";

interface BackupRecord {
  id: string; status: string; trigger: string; progress: number; currentStep: string;
  sizeMb: number; tableCounts: string; remotePath: string; localPath: string; downloadUrl: string;
  errorMessage: string; startedAt: string | null; completedAt: string | null; createdAt: string;
}
interface ProviderRisk { provider: string; servers: number; liveDomains: number; pct: number }
interface BackupData {
  records: BackupRecord[]; lastSuccessAt: string | null; backupAgeHours: number | null;
  backupFresh: boolean; readiness: { providers: ProviderRisk[]; totalLive: number; maxPct: number; concentrationRisk: boolean };
}
interface EvacServer { id: string; label: string; host: string; provider: string; stack: string; status: string; domains: number; live: number }
interface EvacProvider { provider: string; servers: number; domains: number; live: number }
interface EvacJob {
  id: string; status: string; mode: string; sourceProvider: string; sourceServerId: string;
  progress: number; currentStep: string; domainCount: number; reassignedCount: number;
  redeployedCount: number; dnsRepointed: number; errorMessage: string; createdAt: string;
}
interface EvacData { servers: EvacServer[]; providers: EvacProvider[]; jobs: EvacJob[] }

function rel(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "baru saja";
  if (m < 60) return `${m}m lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  success: { bg: "rgba(16,185,129,0.12)", fg: "#10b981" },
  running: { bg: "rgba(14,165,233,0.12)", fg: "#0ea5e9" },
  queued: { bg: "rgba(245,158,11,0.12)", fg: "#f59e0b" },
  failed: { bg: "rgba(239,68,68,0.12)", fg: "#ef4444" },
  partial: { bg: "rgba(245,158,11,0.12)", fg: "#f59e0b" },
};

export default function BackupRecoveryPage() {
  const confirm = useConfirm();
  const [backup, setBackup] = useState<BackupData | null>(null);
  const [evac, setEvac] = useState<EvacData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, e] = await Promise.all([
        fetch("/api/backup").then((r) => r.json()),
        fetch("/api/evacuate").then((r) => r.json()),
      ]);
      if (!b.error) setBackup(b);
      if (!e.error) setEvac(e);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-poll while any backup or evac job is in flight.
  const inflight =
    backup?.records.some((r) => r.status === "queued" || r.status === "running") ||
    evac?.jobs.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => {
    if (!inflight) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [inflight, load]);

  async function backupNow() {
    setBusy("backup");
    try {
      const res = await fetch("/api/backup", { method: "POST" });
      const j = await res.json();
      if (j.alreadyRunning) alert("Backup sudah berjalan.");
      await load();
    } catch (err) { alert("Error: " + String(err)); }
    finally { setBusy(null); }
  }

  async function restore(rec: BackupRecord) {
    const ok = await confirm({
      message: `RESTORE dari backup ${new Date(rec.createdAt).toLocaleString("id-ID")}?\n\n⚠️ BAHAYA: ini menimpa SELURUH database sekarang dengan isi snapshot (${rec.sizeMb} MB). Data yang lebih baru dari snapshot ini akan HILANG. Lanjut?`,
    });
    if (!ok) return;
    setBusy(rec.id);
    try {
      const res = await fetch("/api/backup/restore", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupId: rec.id, confirm: true }),
      });
      const j = await res.json();
      if (j.error) alert(j.error); else alert("Restore di-antri. Daemon akan jalanin.");
      await load();
    } catch (err) { alert("Error: " + String(err)); }
    finally { setBusy(null); }
  }

  async function evacuate(mode: "provider" | "server", source: string, label: string, count: number) {
    const ok = await confirm({
      message: `EVACUATE ${label} (${count} domain)?\n\nEngine akan: provision server pengganti → pindahin domain → re-deploy dari DB → repoint Cloudflare DNS. Dijalanin daemon di anti-spam pace. Lanjut?`,
    });
    if (!ok) return;
    setBusy(source);
    try {
      const res = await fetch("/api/evacuate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "provider" ? { mode, sourceProvider: source } : { mode, sourceServerId: source }),
      });
      const j = await res.json();
      if (j.error) alert(j.error); else alert(`Evakuasi di-antri (${count} domain).`);
      await load();
    } catch (err) { alert("Error: " + String(err)); }
    finally { setBusy(null); }
  }

  return (
    <SidebarInset>
      <AppHeader title="Backup & Recovery" />
      <div className="p-6 space-y-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl" style={{ background: "rgba(20,184,166,0.1)" }}>
              <DatabaseBackup className="size-5" style={{ color: "#14b8a6" }} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Backup & Recovery</h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Backup database + evakuasi provider satu klik. Dijalanin daemon RDP.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
            {loading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />} Refresh
          </Button>
        </div>

        {/* ── DR Readiness ── */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border p-5 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-2">
              {backup?.backupFresh ? <ShieldCheck className="size-4" style={{ color: "#10b981" }} /> : <ShieldAlert className="size-4" style={{ color: "#ef4444" }} />}
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Backup terakhir</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: backup?.backupFresh ? "#10b981" : "#ef4444" }}>{rel(backup?.lastSuccessAt ?? null)}</p>
            <p className="text-[11px] mt-1" style={{ color: "var(--muted-foreground)" }}>
              {backup?.backupAgeHours == null ? "belum pernah backup" : backup.backupFresh ? "fresh (<24 jam)" : `basi (${backup.backupAgeHours} jam) — backup sekarang`}
            </p>
          </div>
          <div className="rounded-xl border p-5 shadow-sm md:col-span-2" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Blast radius — domain live per provider</p>
              {backup?.readiness.concentrationRisk && (
                <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", borderColor: "transparent" }}>
                  <AlertTriangle className="size-3 mr-1" /> konsentrasi {backup.readiness.maxPct}% di 1 provider
                </Badge>
              )}
            </div>
            <div className="space-y-2 mt-3">
              {(backup?.readiness.providers ?? []).map((p) => {
                const danger = p.pct > 25;
                return (
                  <div key={p.provider}>
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span style={{ color: "var(--secondary-foreground)" }}>{p.provider} <span style={{ color: "var(--muted-foreground)" }}>({p.servers} server)</span></span>
                      <span className="font-mono tabular-nums" style={{ color: danger ? "#ef4444" : "var(--muted-foreground)" }}>{p.liveDomains} · {p.pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                      <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: danger ? "#ef4444" : "#14b8a6" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Database Backup ── */}
        <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
            <div>
              <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>Database Backup</h3>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Dump seluruh schema pbn → contabo30 + copy di RDP. Auto-daily + manual.</p>
            </div>
            <Button onClick={backupNow} disabled={busy === "backup"} className="rounded-lg" style={{ background: "linear-gradient(135deg,#14b8a6,#0d9488)", color: "#fff" }}>
              {busy === "backup" ? <Loader2 className="size-4 mr-1 animate-spin" /> : <HardDriveDownload className="size-4 mr-1" />} Backup Sekarang
            </Button>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {(backup?.records ?? []).length === 0 && (
              <div className="px-6 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Belum ada backup.</div>
            )}
            {(backup?.records ?? []).map((r) => {
              const tone = STATUS_TONE[r.status] ?? STATUS_TONE.queued;
              const running = r.status === "queued" || r.status === "running";
              return (
                <div key={r.id} className="px-6 py-3 flex items-center gap-3 text-sm">
                  <Badge variant="outline" className="text-[10px] shrink-0" style={{ background: tone.bg, color: tone.fg, borderColor: "transparent" }}>{r.status}</Badge>
                  {r.trigger === "restore" && <Badge variant="outline" className="text-[10px]" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", borderColor: "transparent" }}>restore</Badge>}
                  {r.trigger === "scheduled" && <Badge variant="outline" className="text-[10px]" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>auto</Badge>}
                  <div className="flex-1 min-w-0">
                    <div style={{ color: "var(--secondary-foreground)" }}>{new Date(r.createdAt).toLocaleString("id-ID")}</div>
                    <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                      {running ? `${r.progress}% — ${r.currentStep}` : r.status === "success" ? `${r.sizeMb} MB${r.remotePath ? " · contabo30 ✓" : " · RDP only"}` : r.errorMessage || r.currentStep}
                    </div>
                    {running && (
                      <div className="h-1 mt-1 w-full rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${r.progress}%`, background: "#0ea5e9" }} />
                      </div>
                    )}
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{rel(r.completedAt || r.createdAt)}</span>
                  {r.status === "success" && r.trigger !== "restore" && (
                    <Button size="xs" variant="outline" disabled={busy === r.id} onClick={() => restore(r)} className="rounded-md" style={{ borderColor: "rgba(239,68,68,0.4)", color: "#ef4444" }} title="Restore DB dari backup ini (bahaya)">
                      <RotateCcw className="size-3.5 mr-1" /> Restore
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Evacuation ── */}
        <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="px-6 py-4 border-b" style={{ borderColor: "var(--border)" }}>
            <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>Evacuation — pindah cepat kalau provider diblok</h3>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Satu klik: provision server baru → reassign domain → re-deploy dari DB → repoint Cloudflare DNS.</p>
          </div>
          <div className="p-4 grid gap-2 md:grid-cols-2">
            {(evac?.providers ?? []).map((p) => {
              const total = evac?.providers.reduce((a, b) => a + b.live, 0) || 1;
              const pct = Math.round((p.live / total) * 100);
              return (
                <div key={p.provider} className="rounded-lg border p-3 flex items-center justify-between" style={{ background: "var(--background)", borderColor: "var(--border)" }}>
                  <div>
                    <div className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>{p.provider}</div>
                    <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{p.servers} server · {p.live} live / {p.domains} domain · {pct}% network</div>
                  </div>
                  <Button size="sm" variant="outline" disabled={busy === p.provider} onClick={() => evacuate("provider", p.provider, p.provider, p.domains)} className="rounded-lg" style={{ borderColor: "rgba(245,158,11,0.4)", color: "#f59e0b" }}>
                    {busy === p.provider ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Play className="size-3.5 mr-1" />} Evacuate
                  </Button>
                </div>
              );
            })}
          </div>

          {(evac?.jobs ?? []).length > 0 && (
            <div className="border-t divide-y" style={{ borderColor: "var(--border)" }}>
              <div className="px-6 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Riwayat evakuasi</div>
              {(evac?.jobs ?? []).map((j) => {
                const tone = STATUS_TONE[j.status] ?? STATUS_TONE.queued;
                const running = j.status === "queued" || j.status === "running";
                return (
                  <div key={j.id} className="px-6 py-3 flex items-center gap-3 text-sm">
                    <Badge variant="outline" className="text-[10px] shrink-0" style={{ background: tone.bg, color: tone.fg, borderColor: "transparent" }}>{j.status}</Badge>
                    <div className="flex-1 min-w-0">
                      <div style={{ color: "var(--secondary-foreground)" }}>
                        <ServerIcon className="inline size-3 mr-1" />{j.mode === "provider" ? j.sourceProvider : j.sourceServerId} · {j.domainCount} domain
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                        {running ? `${j.progress}% — ${j.currentStep}` : `reassign ${j.reassignedCount} · redeploy ${j.redeployedCount} · DNS ${j.dnsRepointed}${j.errorMessage ? " · " + j.errorMessage : ""}`}
                      </div>
                    </div>
                    {j.status === "success" ? <CheckCircle2 className="size-4" style={{ color: "#10b981" }} /> : j.status === "failed" ? <XCircle className="size-4" style={{ color: "#ef4444" }} /> : running ? <Loader2 className="size-4 animate-spin" style={{ color: "#0ea5e9" }} /> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SidebarInset>
  );
}
