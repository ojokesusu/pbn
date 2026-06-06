// Pattern-match deploy log messages into human-friendly diagnoses + fix
// suggestions so the operator doesn't have to interpret raw stderr / fetch
// errors / FTP status codes by hand.
//
// Add new patterns as they surface in production logs. Keep regex tight —
// false positives are worse than UNKNOWN here because they suggest a wrong
// fix and waste operator time.

export type DiagnosisSeverity = "fatal" | "transient" | "config" | "data";

export interface ErrorDiagnosis {
  category: string;          // stable enum-like key for analytics
  label: string;             // short noun phrase, shown as the primary cell text
  cause: string;             // 1-sentence what actually happened
  fix: string;               // what to do next, written for operator
  severity: DiagnosisSeverity;
  actionHref?: string;       // optional internal link to the fix surface
  actionLabel?: string;      // label for the actionHref button
}

const UNKNOWN: ErrorDiagnosis = {
  category: "UNKNOWN",
  label: "Error tidak dikenali",
  cause: "Pesan error belum ada di pattern classifier.",
  fix: "Cek raw message di bawah. Kalau pola berulang, tambah di src/lib/deploy-error-diagnose.ts.",
  severity: "transient",
};

const SUCCESS: ErrorDiagnosis = {
  category: "SUCCESS",
  label: "OK",
  cause: "Operasi sukses.",
  fix: "",
  severity: "transient",
};

// Order matters — first match wins, so list specific patterns BEFORE generic
// ones (e.g. "HTTP 404" before "fetch failed").
const PATTERNS: Array<{
  match: RegExp;
  build: (m: RegExpMatchArray) => ErrorDiagnosis;
}> = [
  // ── FTP / deploy worker ─────────────────────────────────────────────────
  {
    match: /530 Login authentication failed/i,
    build: () => ({
      category: "FTP_AUTH_FAILED",
      label: "FTP login ditolak (530)",
      cause: "Username/password FTP yang tersimpan di Server config gak match dengan yang ada di cPanel/OLS.",
      fix: "Buka /servers, pilih server yang dipake domain ini, re-test FTP creds (atau re-create FTP user di panel + update DB).",
      severity: "config",
      actionHref: "/servers",
      actionLabel: "Cek /servers",
    }),
  },
  {
    match: /Timeout \(control socket\)/i,
    build: () => ({
      category: "SSH_CONTROL_TIMEOUT",
      label: "SSH control socket timeout",
      cause: "Daemon gak bisa establish SSH control connection ke server dalam batas waktu — bisa server down, port 22 di-firewall, atau jaringan ke Indonesian VPS lagi lambat banget.",
      fix: "Cek health server di /health-check atau langsung ssh manual dari RDP. Kalau down, restart server. Kalau jaringan, retry 5 menit lagi.",
      severity: "transient",
      actionHref: "/health-check",
      actionLabel: "Cek /health-check",
    }),
  },
  {
    match: /No such file or directory/i,
    build: () => ({
      category: "FS_PATH_MISSING",
      label: "Path target gak ada",
      cause: "Directory tujuan di server (biasanya /home/<user>/public_html atau equivalent) gak exist.",
      fix: "Cek server FTP root di /servers config. Kalau salah, edit + redeploy.",
      severity: "config",
      actionHref: "/servers",
      actionLabel: "Cek /servers",
    }),
  },
  {
    match: /ECONNRESET|EPIPE|socket hang up/i,
    build: () => ({
      category: "NETWORK_DROP",
      label: "Koneksi terputus tengah jalan",
      cause: "Server jatuh atau jaringan terputus saat upload. Sebagian file mungkin udah ke-upload, sisanya nggak.",
      fix: "Retry deploy domain ini. Kalau berulang 3x, suspect server butuh restart.",
      severity: "transient",
    }),
  },

  // ── IndexNow pre-flight ─────────────────────────────────────────────────
  // After commit 5c3e7bd, errors carry err.cause.code in parens. Match those
  // BEFORE the generic "(fetch failed)" so we route to specific fixes.
  {
    match: /IndexNow aborted: key\.txt HTTP 404/i,
    build: () => ({
      category: "INDEXNOW_KEY_404",
      label: "key.txt 404 di server",
      cause: "Domain hidup tapi key.txt belum ke-deploy ke root. Generator harusnya selalu push file ini.",
      fix: "Trigger ulang deploy domain ini — bukan indexnow-nya. File akan auto ter-upload.",
      severity: "data",
    }),
  },
  {
    match: /IndexNow aborted: key\.txt HTTP (\d+)/i,
    build: (m) => ({
      category: "INDEXNOW_KEY_HTTP_BAD",
      label: `key.txt HTTP ${m[1]}`,
      cause: `Server return ${m[1]} buat key.txt — bisa permission denied, WAF block, atau config nginx/apache salah.`,
      fix: "Buka URL key.txt manual dari browser buat verify. Kalau WAF block, whitelist /key.txt path di Cloudflare.",
      severity: "config",
    }),
  },
  {
    match: /IndexNow aborted:.+ENOTFOUND/i,
    build: () => ({
      category: "INDEXNOW_DNS_DEAD",
      label: "Domain DNS gak resolve",
      cause: "ENOTFOUND — A record domain ini hilang atau registrar expired. Domain effectively dead.",
      fix: "Cek DNS via /domains lalu klik domain → tab Health. Kalau registrar expire, restore atau drop dari pool. Audit 2026-05-31 nemu 47% PBN stock NXDOMAIN.",
      severity: "fatal",
      actionHref: "/domains?filter=dead",
      actionLabel: "Filter dead domains",
    }),
  },
  {
    match: /IndexNow aborted:.+ECONNREFUSED/i,
    build: () => ({
      category: "INDEXNOW_PORT_CLOSED",
      label: "Port 443/80 refused",
      cause: "ECONNREFUSED — DNS resolve OK tapi server gak listen di port HTTPS/HTTP. OLS atau Apache mati.",
      fix: "SSH ke server, restart web service (litespeed restart / systemctl restart apache2).",
      severity: "config",
    }),
  },
  {
    match: /IndexNow aborted:.+(UND_ERR_CONNECT_TIMEOUT|ETIMEDOUT|aborted)/i,
    build: () => ({
      category: "INDEXNOW_TIMEOUT",
      label: "Timeout ke server",
      cause: "Server hidup tapi >15s buat respon. Bisa overload, network ke Indo VPS slow dari Railway, atau routing problem.",
      fix: "Retry 10 menit lagi. Kalau persisten di banyak domain di satu server, server overloaded — cek /health-check.",
      severity: "transient",
      actionHref: "/health-check",
      actionLabel: "Cek /health-check",
    }),
  },
  {
    match: /IndexNow aborted:.+(CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN)/i,
    build: () => ({
      category: "INDEXNOW_SSL",
      label: "SSL cert bermasalah",
      cause: "Cert kadaluwarsa, self-signed, atau chain gak valid. Bing IndexNow gak akan trust.",
      fix: "SSH ke server, run certbot renew. Kalau self-signed, install Let's Encrypt proper.",
      severity: "config",
    }),
  },
  {
    match: /IndexNow aborted: key\.txt not accessible \(fetch failed\)/i,
    build: () => ({
      category: "INDEXNOW_GENERIC_FETCH",
      label: "Fetch gagal (log pre-diagnostic)",
      cause: "Log lama sebelum commit 5c3e7bd — err.cause belum di-capture jadi gak tau penyebab pastinya.",
      fix: "Tunggu deploy attempt baru pasca-5c3e7bd. Error baru bakal nampilin ENOTFOUND / ECONNREFUSED / dst.",
      severity: "transient",
    }),
  },
  {
    match: /IndexNow aborted: key\.txt not accessible \(The operation/i,
    build: () => ({
      category: "INDEXNOW_GENERIC_TIMEOUT_OLD",
      label: "Timeout (log pre-diagnostic)",
      cause: "Pre-commit-5c3e7bd timeout. 5s timeout dulu sering kena false positive ke Indo VPS yang slow.",
      fix: "Tunggu retry pasca-5c3e7bd dengan timeout 15s — kemungkinan udah pass.",
      severity: "transient",
    }),
  },
  {
    match: /IndexNow aborted: daily 10k cap reached/i,
    build: () => ({
      category: "INDEXNOW_QUOTA",
      label: "Daily 10k cap Bing IndexNow",
      cause: "Hard limit Bing IndexNow per key per hari udah penuh.",
      fix: "Tunggu reset UTC 00:00. Kalau urgen, generate IndexNow key kedua + rotate.",
      severity: "transient",
      actionHref: "/google-ping/status",
      actionLabel: "Cek quota",
    }),
  },
];

export function diagnoseDeployError(
  action: string,
  status: string,
  message: string | null | undefined,
): ErrorDiagnosis {
  if (status === "success") return SUCCESS;
  if (!message) return UNKNOWN;
  for (const p of PATTERNS) {
    const m = message.match(p.match);
    if (m) return p.build(m);
  }
  // Action-specific fallbacks before generic UNKNOWN
  if (action === "indexnow") {
    return {
      category: "INDEXNOW_UNCATEGORIZED",
      label: "IndexNow gagal (raw)",
      cause: "Pattern matcher belum kenal pesan ini.",
      fix: "Lihat raw message. Kalau berulang, tambah pattern baru di deploy-error-diagnose.ts.",
      severity: "transient",
    };
  }
  if (action === "deploy") {
    return {
      category: "DEPLOY_UNCATEGORIZED",
      label: "Deploy gagal (raw)",
      cause: "Pattern matcher belum kenal pesan ini.",
      fix: "Lihat raw message. Kalau berulang, tambah pattern baru di deploy-error-diagnose.ts.",
      severity: "transient",
    };
  }
  return UNKNOWN;
}
