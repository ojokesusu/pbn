"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, ServerCog, Wrench, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-modal";

type Severity = "ok" | "warning" | "degraded" | "critical";
type ActionId =
  | "quarantine"
  | "unquarantine"
  | "retry_failed_batch"
  | "rotate_creds_manual"
  | "archive_dead_server"
  | "noop";

interface Cluster {
  pattern: string;
  label: string;
  count: number;
  sampleMessage: string;
}

interface Diagnosis {
  serverId: string;
  label: string;
  host: string;
  provider: string;
  stack: string;
  status: string;
  domainCount: number;
  domainCap: number;
  capUsedPct: number;
  failedLast7d: number;
  totalAttemptsLast7d: number;
  failRatePct: number;
  dominantPattern: Cluster | null;
  allClusters: Cluster[];
  severity: Severity;
  diagnosis: string;
  fix: string;
  recommendedAction: {
    id: ActionId;
    label: string;
    description: string;
    destructive: boolean;
    requiresOperator: boolean;
  };
  lastHealthCheckAt: string | null;
  lastHealthCheckStale: boolean;
}

interface Summary {
  total: number;
  critical: number;
  degraded: number;
  warning: number;
  ok: number;
  actionable: number;
}

const SEV_COLOR: Record<Severity, { fg: string; bg: string; border: string }> = {
  critical: { fg: "#ef4444", bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.25)" },
  degraded: { fg: "#f97316", bg: "rgba(249,115,22,0.06)", border: "rgba(249,115,22,0.25)" },
  warning:  { fg: "#f59e0b", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.25)" },
  ok:       { fg: "#10b981", bg: "rgba(16,185,129,0.06)", border: "rgba(16,185,129,0.25)" },
};

const SEV_LABEL: Record<Severity, string> = {
  critical: "Critical",
  degraded: "Degraded",
  warning: "Warning",
  ok: "OK",
};

function relativeAge(iso: string | null): string {
  if (!iso) return "tidak pernah";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}j lalu`;
  return `${Math.floor(hr / 24)}h lalu`;
}

export default function ServerDiagnosePanel() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Diagnosis[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showOk, setShowOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/health-check/server-engine");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRows(data.servers ?? []);
      setSummary(data.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(row: Diagnosis) {
    const a = row.recommendedAction;
    if (a.id === "noop") return;

    if (a.requiresOperator) {
      const ok = await confirm({
        message: `${a.label}\n\nAction ini perlu intervensi manual. Buka /servers untuk fix. Lanjut?`,
      });
      if (ok) window.open("/servers", "_blank");
      return;
    }

    const confirmMsg = a.destructive
      ? `${a.label} pada ${row.label}?\n\n${a.description}\n\n⚠️ Action ini destructive — pastikan beneran mau.`
      : `${a.label} pada ${row.label}?\n\n${a.description}`;
    const ok = await confirm({ message: confirmMsg });
    if (!ok) return;

    setBusyId(row.serverId);
    try {
      const res = await fetch("/api/health-check/server-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId: row.serverId, action: a.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || `Action gagal: HTTP ${res.status}`);
      } else if (data.retried != null) {
        alert(`${data.retried} item di-retry. Daemon akan pick up next poll.`);
      } else if (data.newStatus) {
        alert(`Status → ${data.newStatus}.`);
      } else if (data.noop) {
        alert(data.message || "Tidak ada perubahan.");
      }
      await load();
    } catch (err) {
      alert("Error: " + String(err));
    } finally {
      setBusyId(null);
    }
  }

  const visible = (rows ?? []).filter((r) => showOk || r.severity !== "ok");

  return (
    <div className="rounded-xl border shadow-sm mb-6 overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-9 rounded-lg" style={{ background: "rgba(20,184,166,0.1)" }}>
            <ServerCog className="size-4" style={{ color: "#14b8a6" }} />
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: "var(--foreground)" }}>
              Server Diagnose &amp; Auto-Fix
            </h3>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Aggregate failure pattern 7 hari → diagnose → recommended action. Klik tombol = engine jalanin.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load()}
          disabled={loading}
          className="rounded-lg"
          style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
        >
          {loading ? <Loader2 className="size-4 mr-1 animate-spin" /> : <RefreshCw className="size-4 mr-1" />}
          Refresh
        </Button>
      </div>

      {summary && (
        <div className="px-6 py-3 border-b flex flex-wrap gap-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
          {(["critical", "degraded", "warning", "ok"] as Severity[]).map((sev) => {
            const c = SEV_COLOR[sev];
            const count = summary[sev];
            return (
              <span
                key={sev}
                className="px-2 py-0.5 rounded-md font-medium"
                style={{ background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}
              >
                {SEV_LABEL[sev]}: <strong className="tabular-nums">{count}</strong>
              </span>
            );
          })}
          <span className="ml-auto" style={{ color: "var(--muted-foreground)" }}>
            {summary.actionable} action tersedia · {summary.total} server total
          </span>
        </div>
      )}

      {error && (
        <div className="px-6 py-3 border-b text-xs" style={{ borderColor: "var(--border)", background: "rgba(239,68,68,0.06)", color: "#dc2626" }}>
          Gagal load: {error}
        </div>
      )}

      {!loading && (rows?.length ?? 0) === 0 && (
        <div className="px-6 py-8 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
          Belum ada data server.
        </div>
      )}

      {visible.length > 0 && (
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {visible.map((row) => {
            const c = SEV_COLOR[row.severity];
            const isOpen = expanded === row.serverId;
            const isBusy = busyId === row.serverId;
            const a = row.recommendedAction;
            return (
              <div key={row.serverId} className="px-6 py-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : row.serverId)}
                    className="shrink-0 mt-0.5"
                    title={isOpen ? "Tutup detail" : "Buka detail"}
                  >
                    <ChevronDown
                      className={`size-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      style={{ color: "var(--muted-foreground)" }}
                    />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>
                        {row.label}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px]"
                        style={{ background: c.bg, color: c.fg, borderColor: c.border }}
                      >
                        {SEV_LABEL[row.severity]}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                        {row.status}
                      </Badge>
                      {row.provider && (
                        <Badge variant="outline" className="text-[10px]" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
                          {row.provider}/{row.stack || "?"}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs flex flex-wrap items-center gap-x-3 gap-y-0.5" style={{ color: "var(--muted-foreground)" }}>
                      <span className="font-mono">{row.host}</span>
                      <span>
                        domains <strong className="tabular-nums" style={{ color: "var(--secondary-foreground)" }}>
                          {row.domainCount}{row.domainCap > 0 ? `/${row.domainCap}` : ""}
                        </strong>
                        {row.capUsedPct > 100 && (
                          <span className="ml-1 text-[10px] px-1 rounded" style={{ background: "rgba(239,68,68,0.15)", color: "#dc2626" }}>
                            over-cap {row.capUsedPct.toFixed(0)}%
                          </span>
                        )}
                      </span>
                      <span>
                        fail{" "}
                        <strong className="tabular-nums" style={{ color: row.failRatePct > 50 ? "#ef4444" : row.failRatePct > 20 ? "#f59e0b" : "var(--secondary-foreground)" }}>
                          {row.failedLast7d}/{row.totalAttemptsLast7d}
                        </strong>{" "}
                        ({row.failRatePct}%)
                      </span>
                      <span>HC: {relativeAge(row.lastHealthCheckAt)}</span>
                    </div>
                    {row.dominantPattern && (
                      <div className="text-xs mt-1.5 flex items-start gap-1.5" style={{ color: "var(--secondary-foreground)" }}>
                        <AlertTriangle className="size-3.5 mt-0.5 shrink-0" style={{ color: c.fg }} />
                        <span>
                          <strong>{row.dominantPattern.label}</strong>{" "}
                          <span style={{ color: "var(--muted-foreground)" }}>
                            — {row.dominantPattern.count}x. {row.diagnosis}
                          </span>
                        </span>
                      </div>
                    )}
                    {!row.dominantPattern && row.severity !== "ok" && (
                      <div className="text-xs mt-1.5" style={{ color: "var(--secondary-foreground)" }}>
                        {row.diagnosis}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0">
                    {a.id === "noop" ? (
                      <Badge variant="outline" className="text-[10px]" style={{ background: SEV_COLOR.ok.bg, color: SEV_COLOR.ok.fg, borderColor: SEV_COLOR.ok.border }}>
                        <CheckCircle2 className="size-3 mr-1" />
                        sehat
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => runAction(row)}
                        disabled={isBusy}
                        className="rounded-lg text-xs"
                        style={{
                          background: a.destructive ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #14b8a6, #0d9488)",
                          color: "#ffffff",
                        }}
                        title={a.description}
                      >
                        {isBusy ? (
                          <Loader2 className="size-3.5 mr-1 animate-spin" />
                        ) : a.requiresOperator ? (
                          <Wrench className="size-3.5 mr-1" />
                        ) : (
                          <Zap className="size-3.5 mr-1" />
                        )}
                        {a.label}
                      </Button>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="mt-3 ml-7 rounded-lg border p-3 space-y-2 text-xs" style={{ background: "var(--background)", borderColor: "var(--border)" }}>
                    <div>
                      <span className="font-semibold" style={{ color: "var(--foreground)" }}>Fix plan:</span>{" "}
                      <span style={{ color: "var(--secondary-foreground)" }}>{row.fix}</span>
                    </div>
                    {row.allClusters.length > 0 && (
                      <div>
                        <div className="font-semibold mb-1" style={{ color: "var(--foreground)" }}>Cluster (7 hari)</div>
                        <div className="space-y-1.5">
                          {row.allClusters.slice(0, 5).map((cl) => (
                            <div key={cl.pattern} className="flex items-start gap-2">
                              <Badge variant="outline" className="text-[10px] shrink-0" style={{ background: "rgba(239,68,68,0.06)", color: "#dc2626", borderColor: "transparent" }}>
                                {cl.count}x
                              </Badge>
                              <div className="flex-1 min-w-0">
                                <div style={{ color: "var(--secondary-foreground)" }}>{cl.label}</div>
                                {cl.sampleMessage && (
                                  <div className="font-mono text-[10px] truncate mt-0.5" style={{ color: "var(--muted-foreground)" }} title={cl.sampleMessage}>
                                    {cl.sampleMessage}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {row.allClusters.length > 5 && (
                            <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                              +{row.allClusters.length - 5} cluster lain
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {row.lastHealthCheckStale && (
                      <div className="rounded-md border p-2" style={{ background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.3)", color: "#b45309" }}>
                        ⚠ HealthCheck row stale (&gt; 1 jam) — daemon RDP mungkin gak push update untuk server ini.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {summary && summary.ok > 0 && (
        <div className="px-3 pb-3 pt-2">
          <button
            type="button"
            onClick={() => setShowOk(!showOk)}
            className="w-full rounded-lg border-dashed border px-3 py-2 text-xs text-center hover:bg-[color:var(--muted)] transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
          >
            {showOk ? `Sembunyikan ${summary.ok} server sehat` : `+ ${summary.ok} server sehat — klik untuk show`}
          </button>
        </div>
      )}
    </div>
  );
}
