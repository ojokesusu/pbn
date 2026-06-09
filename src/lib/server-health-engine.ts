// Server-Health Engine — per-server diagnose + action recommender.
//
// What this does:
//   1. Pulls each Server with its recent DeployQueueItem failures and HealthCheck.
//   2. Clusters failures by pattern (530, PASV timeout, ECONN, etc).
//   3. Emits one ServerDiagnosis per server with the dominant pattern + a single
//      recommended Action the operator can run with one click.
//
// The engine is intentionally conservative:
//   - It NEVER auto-executes anything. The caller chooses to invoke an action.
//   - Actions returned are limited to safe-to-reverse ones (quarantine toggle,
//      retry failed batch). Things like rotate-creds always require the human.
//
// Add new failure patterns to FAILURE_PATTERNS as they surface in prod.

import type { Server } from "@prisma/client";

export type ServerActionId =
  | "quarantine"
  | "unquarantine"
  | "retry_failed_batch"
  | "rotate_creds_manual"
  | "archive_dead_server"
  | "noop";

export interface ServerAction {
  id: ServerActionId;
  label: string;
  description: string;
  destructive: boolean;          // require confirm before firing
  requiresOperator: boolean;     // we can NOT auto-do this — point to /servers
}

export type ServerSeverity = "ok" | "warning" | "degraded" | "critical";

export interface FailureCluster {
  pattern: string;               // stable enum-like key, e.g. "FTP_AUTH_530"
  label: string;                 // human label, e.g. "FTP login ditolak (530)"
  count: number;                 // # failures matching this pattern in window
  sampleMessage: string;         // most-recent raw message in this cluster
}

export interface ServerDiagnosis {
  serverId: string;
  label: string;
  host: string;
  provider: string;
  stack: string;
  status: string;                // current Server.status
  domainCount: number;
  domainCap: number;
  capUsedPct: number;
  failedLast7d: number;
  totalAttemptsLast7d: number;
  failRatePct: number;           // failed / total * 100, 0 if no attempts
  dominantPattern: FailureCluster | null;
  allClusters: FailureCluster[];
  severity: ServerSeverity;
  diagnosis: string;             // 1-sentence what's wrong
  fix: string;                   // operator-readable action plan
  recommendedAction: ServerAction;
  lastHealthCheckAt: string | null;
  lastHealthCheckStale: boolean; // >1h or null
}

// --------------------------------------------------------------------------
// Pattern catalog — first match wins. Tighter patterns BEFORE looser ones.
// --------------------------------------------------------------------------
const FAILURE_PATTERNS: Array<{ key: string; label: string; match: RegExp }> = [
  { key: "FTP_AUTH_530",      label: "FTP login ditolak (530)",            match: /530 Login authentication failed/i },
  { key: "FTP_AUTH_TAGGED",   label: "FTP login ditolak (post-retry)",     match: /^\[AUTH\]/i },
  { key: "FTP_PASV_TIMEOUT",  label: "PASV/control-socket timeout",         match: /Timeout \((?:control|data) socket\)|Timeout when trying to open data connection/i },
  { key: "FTP_NET_TAGGED",    label: "FTP gagal (net/timeout)",            match: /^\[NET\]/i },
  { key: "FTP_TLS_TAGGED",    label: "TLS handshake gagal",                match: /^\[TLS\]/i },
  { key: "AUTH_TIMEOUT",      label: "FTP auth timeout",                   match: /AuthenticationException: Authentication timeout/i },
  { key: "AUTH_FAILED",       label: "FTP auth failed (generic)",          match: /AuthenticationException: Authentication failed/i },
  { key: "READ_TIMEOUT",      label: "Read operation timeout",             match: /read operation timed out|RemoteDisconnected/i },
  { key: "HTTP_5XX_UPSTREAM", label: "Worker upstream 502/5xx",            match: /http_502:|http_500:/i },
  { key: "UNSUPPORTED_STACK", label: "Stack unmanaged (deploy belum siap)", match: /unsupported_stack:unmanaged/i },
  { key: "ECONN_RESET",       label: "Connection reset/EPIPE",             match: /ECONNRESET|EPIPE|socket hang up/i },
  { key: "NO_SUCH_FILE",      label: "Path target gak ada",                match: /No such file or directory/i },
];

function classifyMessage(message: string | null | undefined): { key: string; label: string } {
  if (!message) return { key: "UNKNOWN", label: "Pesan kosong" };
  for (const p of FAILURE_PATTERNS) {
    if (p.match.test(message)) return { key: p.key, label: p.label };
  }
  return { key: "UNKNOWN", label: "Belum dikenal" };
}

// --------------------------------------------------------------------------
// Action picker — translate (status, dominant pattern, fail rate) → action.
// --------------------------------------------------------------------------
const ACTION_QUARANTINE: ServerAction = {
  id: "quarantine",
  label: "Quarantine server",
  description: "Pause deploy queue ke server ini. Domain existing aman, cuma worker berhenti push baru.",
  destructive: false,
  requiresOperator: false,
};
const ACTION_UNQUARANTINE: ServerAction = {
  id: "unquarantine",
  label: "Aktifkan kembali",
  description: "Server status → active. Worker mulai push lagi sesuai pace harian.",
  destructive: false,
  requiresOperator: false,
};
const ACTION_RETRY_BATCH: ServerAction = {
  id: "retry_failed_batch",
  label: "Retry failed batch",
  description: "Reset semua DeployQueueItem failed di server ini → queued. Daemon coba ulang.",
  destructive: false,
  requiresOperator: false,
};
const ACTION_ROTATE_CREDS: ServerAction = {
  id: "rotate_creds_manual",
  label: "Rotate FTP creds (manual)",
  description: "Engine gak bisa rotate creds otomatis. Buka /servers, klik server, re-test koneksi + update password kalau salah.",
  destructive: false,
  requiresOperator: true,
};
const ACTION_ARCHIVE: ServerAction = {
  id: "archive_dead_server",
  label: "Archive server",
  description: "Server status → archived. Hilang dari roll-up + scheduler skip. Pakai kalau server permanen mati.",
  destructive: true,
  requiresOperator: false,
};
const ACTION_NOOP: ServerAction = {
  id: "noop",
  label: "Tidak ada action",
  description: "Server sehat. Tidak perlu intervensi.",
  destructive: false,
  requiresOperator: false,
};

function pickAction(args: {
  status: string;
  dominantKey: string | null;
  failRatePct: number;
  failedLast7d: number;
  totalAttemptsLast7d: number;
}): { action: ServerAction; diagnosis: string; fix: string; severity: ServerSeverity } {
  const { status, dominantKey, failRatePct, failedLast7d, totalAttemptsLast7d } = args;

  if (status === "archived") {
    return {
      action: ACTION_NOOP,
      diagnosis: "Server sudah di-archive — di-skip semua pipeline.",
      fix: "Tidak perlu action. Kalau mau re-aktivasi, edit row Server di DB / panel.",
      severity: "ok",
    };
  }

  // Quarantined branch — should we unquarantine?
  if (status === "quarantined") {
    // Stay quarantined if recent failures still cluster on AUTH / NET — operator hasn't fixed root cause.
    if (failedLast7d > 0 && (dominantKey?.startsWith("FTP_AUTH") || dominantKey === "AUTH_FAILED" || dominantKey === "AUTH_TIMEOUT")) {
      return {
        action: ACTION_ROTATE_CREDS,
        diagnosis: `Quarantined karena pola ${dominantKey} — creds belum di-rotate.`,
        fix: "Buka /servers, klik server, test koneksi. Kalau pakai cPanel/aapanel, re-create FTP user + update password di Server row.",
        severity: "degraded",
      };
    }
    if (failedLast7d > 0 && dominantKey === "UNSUPPORTED_STACK") {
      return {
        action: ACTION_ROTATE_CREDS,
        diagnosis: "Stack di-mark 'unmanaged' — worker gak tau cara deploy ke server ini.",
        fix: "Set Server.stack ke salah satu: bare_ols / aapanel / cpanel sesuai panel beneran. Edit di /servers.",
        severity: "degraded",
      };
    }
    // If no recent failures in 7d, server might be ready to come back.
    if (failedLast7d === 0) {
      return {
        action: ACTION_UNQUARANTINE,
        diagnosis: "Tidak ada kegagalan deploy dalam 7 hari terakhir — kemungkinan root cause udah teratasi.",
        fix: "Klik Aktifkan kembali. Daemon mulai push pelan-pelan; kalau gagal lagi engine akan suggest re-quarantine.",
        severity: "warning",
      };
    }
    return {
      action: ACTION_RETRY_BATCH,
      diagnosis: `Quarantined dengan ${failedLast7d} failed item. Pola: ${dominantKey ?? "unknown"}.`,
      fix: "Retry failed batch dulu — kalau berhasil, engine bakal kasih opsi unquarantine.",
      severity: "warning",
    };
  }

  // Active branch
  if (status === "active") {
    if (totalAttemptsLast7d === 0) {
      return {
        action: ACTION_NOOP,
        diagnosis: "Belum ada deploy attempt 7 hari — server idle.",
        fix: "Tidak perlu action. Cek apakah ada domain ter-assign ke server ini.",
        severity: "ok",
      };
    }
    if (failRatePct >= 60) {
      // Almost every attempt fails — quarantine immediately.
      return {
        action: ACTION_QUARANTINE,
        diagnosis: `Fail rate ${failRatePct.toFixed(0)}% (${failedLast7d}/${totalAttemptsLast7d}). Pola: ${dominantKey ?? "mixed"}.`,
        fix: "Quarantine dulu biar daemon berhenti push ke sini. Setelah root cause di-fix (creds / panel / stack), retry batch + unquarantine.",
        severity: "critical",
      };
    }
    if (failRatePct >= 20) {
      return {
        action: ACTION_RETRY_BATCH,
        diagnosis: `Fail rate ${failRatePct.toFixed(0)}%. Pola dominan: ${dominantKey ?? "mixed"}.`,
        fix: "Retry failed batch — banyak failure transient (PASV/NAT/timeout). Kalau retry gagal >50%, engine bakal eskalasi ke quarantine.",
        severity: "degraded",
      };
    }
    if (failRatePct > 0) {
      return {
        action: ACTION_RETRY_BATCH,
        diagnosis: `Fail rate ${failRatePct.toFixed(1)}% — masih dalam batas wajar.`,
        fix: "Retry failed batch kalau mau bersihin antrian. Tidak urgent.",
        severity: "warning",
      };
    }
    return {
      action: ACTION_NOOP,
      diagnosis: "0% fail rate dalam 7 hari — server sehat.",
      fix: "Tidak perlu action.",
      severity: "ok",
    };
  }

  return {
    action: ACTION_NOOP,
    diagnosis: `Status '${status}' tidak di-handle engine.`,
    fix: "Tidak ada saran.",
    severity: "warning",
  };
}

// --------------------------------------------------------------------------
// Public API — call with each server + its recent failure messages.
// --------------------------------------------------------------------------
export interface FailureRow {
  serverId: string;
  status: string;                // queue item status (failed / completed)
  errorMessage: string | null;
}

export interface ServerHealthInput {
  server: Pick<Server, "id" | "label" | "name" | "host" | "provider" | "stack" | "status" | "domainCap" | "lastHealthCheck">;
  domainCount: number;
  failures: FailureRow[];        // ALL queue items in 7d window for this server
}

export function diagnoseServer(input: ServerHealthInput): ServerDiagnosis {
  const { server, domainCount, failures } = input;

  const failedRows = failures.filter((f) => f.status === "failed");
  const totalAttempts = failures.length;
  const failedCount = failedRows.length;
  const failRate = totalAttempts > 0 ? (failedCount / totalAttempts) * 100 : 0;

  // Build clusters
  const clusterMap = new Map<string, FailureCluster>();
  for (const row of failedRows) {
    const { key, label } = classifyMessage(row.errorMessage);
    const existing = clusterMap.get(key);
    if (existing) {
      existing.count += 1;
      // Keep the longest sample so the operator has the most info.
      if (row.errorMessage && row.errorMessage.length > existing.sampleMessage.length) {
        existing.sampleMessage = row.errorMessage;
      }
    } else {
      clusterMap.set(key, {
        pattern: key,
        label,
        count: 1,
        sampleMessage: row.errorMessage ?? "",
      });
    }
  }
  const allClusters = [...clusterMap.values()].sort((a, b) => b.count - a.count);
  const dominant = allClusters[0] ?? null;

  const cap = server.domainCap ?? 0;
  const capUsedPct = cap > 0 ? Math.round((domainCount / cap) * 1000) / 10 : 0;

  const { action, diagnosis, fix, severity } = pickAction({
    status: server.status,
    dominantKey: dominant?.pattern ?? null,
    failRatePct: failRate,
    failedLast7d: failedCount,
    totalAttemptsLast7d: totalAttempts,
  });

  const lastHcAt = server.lastHealthCheck ? new Date(server.lastHealthCheck) : null;
  const stale = !lastHcAt || Date.now() - lastHcAt.getTime() > 60 * 60 * 1000;

  return {
    serverId: server.id,
    label: server.label ?? server.name ?? server.host,
    host: server.host,
    provider: server.provider ?? "",
    stack: server.stack ?? "",
    status: server.status,
    domainCount,
    domainCap: cap,
    capUsedPct,
    failedLast7d: failedCount,
    totalAttemptsLast7d: totalAttempts,
    failRatePct: Math.round(failRate * 10) / 10,
    dominantPattern: dominant,
    allClusters,
    severity,
    diagnosis,
    fix,
    recommendedAction: action,
    lastHealthCheckAt: lastHcAt ? lastHcAt.toISOString() : null,
    lastHealthCheckStale: stale,
  };
}

export function sortDiagnoses(rows: ServerDiagnosis[]): ServerDiagnosis[] {
  // Critical first, then degraded, warning, ok. Within each tier, highest fail rate first.
  const rank: Record<ServerSeverity, number> = { critical: 0, degraded: 1, warning: 2, ok: 3 };
  return [...rows].sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return b.failRatePct - a.failRatePct;
  });
}
