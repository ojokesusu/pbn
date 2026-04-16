"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Globe,
  FileText,
  Rocket,
  Palette,
  Plus,
  ArrowRight,
  Server,
  Search,
  Zap,
  Activity,
  Link2,
  Heart,
  Clock,
  Eye,
  CheckCircle2,
  XCircle,
  Play,
  Loader2,
  AlertCircle,
} from "lucide-react";

import { AppHeader } from "@/components/layout/app-header";
import { NotificationBell } from "@/components/ui/notification-bell";
import { UserMenu } from "@/components/ui/user-menu";
import { useConfirm } from "@/components/ui/confirm-modal";
import { SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Stats {
  totalDomains: number;
  totalArticles: number;
  recentDeploys: number;
  activeThemes: number;
  totalServers: number;
  totalBacklinks: number;
  deployedDomains: number;
  aliveDomains: number;
  deadDomains: number;
  schedulerActive: number;
  schedulerRunning: boolean;
  todayArticles: number;
  todayDeploys: number;
  indexedDomains: number;
  todayBacklinks: number;
  totalBacklinkPlacements: number;
  backlinkDailyLimit: number;
  domainsWithoutSchedule: number;
}

interface Domain {
  id: string;
  name: string;
  url: string;
  status: string;
  genre: string;
  lastDeployed: string | null;
  isAlive: boolean;
  _count: { articles: number };
  theme: { name: string } | null;
}

/* ─── Donut Chart ─── */
function DonutChart({ percentage, label }: { percentage: number; label: string }) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={radius} fill="none"
          stroke="url(#donutGrad)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#84cc16" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold text-[color:var(--foreground)]">{percentage}%</span>
        <span className="text-[10px] text-[color:var(--muted-foreground)] mt-0.5">{label}</span>
      </div>
    </div>
  );
}

/* ─── Fun animated card wrapper ─── */
function FunCard({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.95)",
        transition: `opacity 0.4s ease ${delay}ms, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms`,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";
        el.style.transform = "translateY(-6px) scale(1.02)";
        el.style.boxShadow = "0 12px 28px rgba(14, 165, 233, 0.25), 0 0 0 2px rgba(14, 165, 233, 0.15)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.transition = "transform 0.2s ease, box-shadow 0.2s ease";
        el.style.transform = "translateY(0) scale(1)";
        el.style.boxShadow = "";
      }}
    >
      {children}
    </div>
  );
}

/* ─── Animated Counter ─── */
function AnimatedNumber({ value, duration = 1000 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const start = 0;
    const end = value;
    const startTime = Date.now();
    function tick() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [value, duration]);
  return <>{display.toLocaleString()}</>;
}

/* ─── Mini Stat Card ─── */
function MiniStat({ icon: Icon, label, value, color, href }: {
  icon: typeof Globe; label: string; value: string | number; color: string; href?: string;
}) {
  const content = (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-[color:var(--background)] transition-colors">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}15` }}>
        <Icon className="size-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-[color:var(--foreground)] leading-none">{value}</p>
        <p className="text-[11px] text-[color:var(--muted-foreground)] mt-0.5">{label}</p>
      </div>
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

export default function Home() {
  const router = useRouter();
  const confirm = useConfirm();
  const [stats, setStats] = useState<Stats | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState<Date | null>(null);
  const [taskRunning, setTaskRunning] = useState<string | null>(null);
  const [taskResult, setTaskResult] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      Promise.all([
        fetch("/api/stats").then((r) => r.json()),
        fetch("/api/domains").then((r) => r.json()),
      ]).then(([s, d]) => {
        setStats(s);
        setDomains(d);
        setLoading(false);
      });
    };
    load();
    // Refresh when tab becomes visible again (e.g. after returning from /domains)
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Also refresh every 30s so stale banners auto-clear
    const interval = setInterval(load, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, []);

  // Live clock — client-only to avoid hydration mismatch
  useEffect(() => {
    setClock(new Date());
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const now = clock || new Date();
  const today = now.toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const timeStr = clock
    ? clock.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "--:--:--";

  function refreshStats() {
    Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/domains").then((r) => r.json()),
    ]).then(([s, d]) => { setStats(s); setDomains(d); });
  }

  async function runTask(task: string) {
    if (taskRunning) return;
    setTaskResult(null);

    if (task === "deploy") {
      const ok = await confirm({ message: "Deploy 15 domain yang belum di-deploy? Akan generate site + upload FTP." });
      if (!ok) return;
      setTaskRunning("deploy");
      try {
        const res = await fetch("/api/deploy/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 15, filter: "hasContent" }),
        });
        const data = await res.json();
        setTaskResult(`Deploy: ${data.summary?.success ?? 0} berhasil, ${data.summary?.failed ?? 0} gagal`);
        refreshStats();
      } catch { setTaskResult("Deploy gagal"); }
      finally { setTaskRunning(null); }
    }

    if (task === "generate") {
      const ok = await confirm({ message: "Jalankan scheduler tick untuk generate artikel + deploy otomatis?" });
      if (!ok) return;
      setTaskRunning("generate");
      try {
        const res = await fetch("/api/scheduler/tick", { method: "POST" });
        const data = await res.json();
        setTaskResult(`Generate: ${data.generated ?? 0} artikel, ${data.deployed ?? 0} deploy`);
        refreshStats();
      } catch { setTaskResult("Generate gagal"); }
      finally { setTaskRunning(null); }
    }

    if (task === "health") {
      const ok = await confirm({ message: "Jalankan health check untuk semua domain? Ini akan ping setiap domain." });
      if (!ok) return;
      setTaskRunning("health");
      try {
        const res = await fetch("/api/health-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true, limit: 50, offset: 0 }),
        });
        const data = await res.json();
        setTaskResult(`Health: ${data.results?.length ?? 0} domain dicek`);
        refreshStats();
      } catch { setTaskResult("Health check gagal"); }
      finally { setTaskRunning(null); }
    }

    if (task === "index") {
      router.push("/index-monitor");
    }

    if (task === "backlinks") {
      const remaining = (stats?.backlinkDailyLimit ?? 15) - (stats?.todayBacklinks ?? 0);
      if (remaining <= 0) {
        setTaskResult("Batas backlink hari ini sudah tercapai");
        return;
      }
      const ok = await confirm({
        message: `Sebar maksimal ${remaining} backlink sekarang?\n\nPRIORITAS: MS → MS 2 → LP → RTP → CN\nAnchor: 60% branded, 30% URL, 10% keyword`,
      });
      if (!ok) return;
      setTaskRunning("backlinks");
      try {
        const res = await fetch("/api/backlinks/distribute", { method: "POST" });
        const data = await res.json();
        setTaskResult(`Backlink: ${data.placed ?? 0} terpasang (${data.remainingToday ?? 0} sisa hari ini)`);
        refreshStats();
      } catch { setTaskResult("Sebar backlink gagal"); }
      finally { setTaskRunning(null); }
    }
  }

  const deployedCount = stats?.deployedDomains ?? 0;
  const totalDomains = stats?.totalDomains ?? 0;
  const readinessPercent = totalDomains > 0 ? Math.round((deployedCount / totalDomains) * 100) : 0;

  const cardBase =
    "rounded-xl border border-[color:var(--border)] bg-white hover-lift animate-bounce-in";

  return (
    <SidebarInset>
      <AppHeader title="Dasbor" />

      <div className="flex-1 space-y-6 p-6 md:p-8 overflow-y-auto bg-fun-pattern" style={{ background: "var(--background)" }}>
        {/* ═══════ Header with Clock ═══════ */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-5">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ background: "linear-gradient(135deg, #0ea5e9, #84cc16)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {(() => {
                  const hour = now.getHours();
                  if (hour < 11) return "Selamat Pagi";
                  if (hour < 15) return "Selamat Siang";
                  if (hour < 18) return "Selamat Sore";
                  return "Selamat Malam";
                })()}
              </h2>
              <p className="text-sm text-[color:var(--muted-foreground)] mt-1">{today}</p>
            </div>
            {/* Live Clock */}
            <div className="hidden md:flex items-center gap-2 rounded-xl border px-4 py-2.5" style={{ background: "linear-gradient(135deg, rgba(14,165,233,0.05), rgba(132,204,22,0.05))", borderColor: "rgba(14,165,233,0.15)" }}>
              <Clock className="size-4 text-[#0ea5e9]" />
              <span className="text-xl font-mono font-bold tabular-nums tracking-wider" style={{ color: "var(--foreground)" }}>{timeStr}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 bg-white border border-[color:var(--border)] rounded-lg px-3 py-2 w-64">
              <Search className="h-4 w-4 text-[color:var(--muted-foreground)]" />
              <span className="text-sm text-[color:var(--muted-foreground)]">Cari domain, artikel...</span>
            </div>
            <NotificationBell />
            <UserMenu />
          </div>
        </div>

        {/* ═══════ Inactive Domains Banner — actionable warning ═══════ */}
        {stats && stats.domainsWithoutSchedule > 10 && (
          <Link href="/domains?filter=inactive" className="block rounded-xl border-2 p-4 transition-all hover:shadow-lg" style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.1), rgba(239,68,68,0.05))", borderColor: "rgba(245,158,11,0.4)" }}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(245,158,11,0.2)" }}>
                  <AlertCircle className="size-6" style={{ color: "#f59e0b" }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-[color:var(--foreground)]">
                    🔔 {stats.domainsWithoutSchedule} domain belum aktif di scheduler
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                    Domain ini sudah ada tapi belum di-deploy. Klik buat aktivasi bulk.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm" style={{ background: "#f59e0b", color: "#ffffff" }}>
                Aktivasi sekarang <ArrowRight className="size-4" />
              </div>
            </div>
          </Link>
        )}

        {/* ═══════ Scheduler Status Banner ═══════ */}
        {stats?.schedulerRunning && (
          <div className="rounded-xl border p-4 flex items-center justify-between animate-bounce-in animate-gradient" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(14,165,233,0.08), rgba(132,204,22,0.08))", backgroundSize: "200% 200%", borderColor: "rgba(16,185,129,0.2)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center animate-float">
                <Clock className="size-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[color:var(--foreground)]">
                  Scheduler Aktif
                  <span className="inline-flex items-center ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500 text-white">
                    RUNNING
                  </span>
                </p>
                <p className="text-xs text-[color:var(--muted-foreground)]">
                  {stats.schedulerActive} domain aktif — {stats.todayArticles} artikel hari ini, {stats.todayDeploys} deploy
                </p>
              </div>
            </div>
            <Link href="/scheduler">
              <Button variant="outline" size="sm" className="rounded-lg text-xs" style={{ borderColor: "rgba(16,185,129,0.3)", color: "#10b981" }}>
                Lihat Scheduler <ArrowRight className="size-3 ml-1" />
              </Button>
            </Link>
          </div>
        )}

        {/* ═══════ Daily Tasks ═══════ */}
        {!loading && stats && (
          <FunCard delay={50}>
          <div className="rounded-xl border bg-white p-5" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}>
                  <Zap className="size-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--foreground)]">Tugas Hari Ini</h3>
                  <p className="text-[10px] text-[color:var(--muted-foreground)]">{today}</p>
                </div>
              </div>
              <span className="text-[10px] font-medium px-2 py-1 rounded-full" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9" }}>
                {timeStr}
              </span>
            </div>
            {/* Task result toast */}
            {taskResult && (
              <div className="mb-3 p-3 rounded-lg text-xs font-medium flex items-center justify-between" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}>
                <span>{taskResult}</span>
                <button onClick={() => setTaskResult(null)} className="text-[color:var(--muted-foreground)] hover:text-[color:var(--secondary-foreground)]">
                  <XCircle className="size-3.5" />
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Task 1: Deploy — scheduler handles deploy, show status only */}
              {(() => {
                const auto = stats.schedulerRunning
                const done = stats.todayDeploys > 0
                return (
                  <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ borderColor: done ? "rgba(16,185,129,0.3)" : "var(--border)", background: done ? "rgba(16,185,129,0.1)" : auto ? "rgba(14,165,233,0.1)" : "rgba(245,158,11,0.1)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: done ? "rgba(16,185,129,0.15)" : auto ? "rgba(14,165,233,0.15)" : "rgba(245,158,11,0.15)" }}>
                      {done ? <CheckCircle2 className="size-4 text-emerald-500" /> : auto ? <Clock className="size-4 text-[#0ea5e9]" /> : <Rocket className="size-4" style={{ color: "#f59e0b" }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[color:var(--foreground)]">{done ? "Deploy selesai" : "Deploy domain"}</p>
                      <p className="text-[10px]" style={{ color: done ? "#10b981" : auto ? "#0ea5e9" : "var(--muted-foreground)" }}>
                        {done ? `${stats.todayDeploys} deploy hari ini` : auto ? "Otomatis oleh scheduler" : `${stats.deployedDomains}/${stats.totalDomains}`}
                      </p>
                    </div>
                    {done ? (
                      <span className="text-[10px] font-medium px-2 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>Done</span>
                    ) : auto ? (
                      <span className="text-[10px] font-medium px-2 py-1 rounded-full" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9" }}>Auto</span>
                    ) : (
                      <button onClick={() => runTask("deploy")} disabled={taskRunning !== null} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-150 hover:scale-110" style={{ background: "linear-gradient(135deg, #0ea5e9, #0284c7)", color: "#ffffff", opacity: taskRunning ? 0.5 : 1 }}>
                        {taskRunning === "deploy" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                      </button>
                    )}
                  </div>
                )
              })()}

              {/* Task 2: Generate — scheduler handles this, show count */}
              {(() => {
                const auto = stats.schedulerRunning
                const done = stats.todayArticles >= 3
                return (
                  <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ borderColor: done ? "rgba(16,185,129,0.3)" : "var(--border)", background: done ? "rgba(16,185,129,0.1)" : auto ? "rgba(14,165,233,0.1)" : "rgba(245,158,11,0.1)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: done ? "rgba(16,185,129,0.15)" : auto ? "rgba(14,165,233,0.15)" : "rgba(245,158,11,0.15)" }}>
                      {done ? <CheckCircle2 className="size-4 text-emerald-500" /> : auto ? <Clock className="size-4 text-[#0ea5e9]" /> : <FileText className="size-4" style={{ color: "#f59e0b" }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[color:var(--foreground)]">{done ? "Artikel selesai" : "Generate artikel"}</p>
                      <p className="text-[10px]" style={{ color: done ? "#10b981" : auto ? "#0ea5e9" : "var(--muted-foreground)" }}>
                        {stats.todayArticles} artikel{auto && !done ? " (otomatis)" : " hari ini"}
                      </p>
                    </div>
                    {done ? (
                      <span className="text-[10px] font-medium px-2 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>Done</span>
                    ) : auto ? (
                      <span className="text-[10px] font-medium px-2 py-1 rounded-full" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9" }}>Auto</span>
                    ) : (
                      <button onClick={() => runTask("generate")} disabled={taskRunning !== null} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-150 hover:scale-110" style={{ background: "linear-gradient(135deg, #84cc16, #65a30d)", color: "#ffffff", opacity: taskRunning ? 0.5 : 1 }}>
                        {taskRunning === "generate" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                      </button>
                    )}
                  </div>
                )
              })()}

              {/* Task 3: Check index — always manual */}
              <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ borderColor: "var(--border)", background: stats.indexedDomains > 0 ? "rgba(16,185,129,0.1)" : "rgba(168,85,247,0.08)" }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: stats.indexedDomains > 0 ? "rgba(16,185,129,0.15)" : "rgba(168,85,247,0.15)" }}>
                  {stats.indexedDomains > 0 ? <CheckCircle2 className="size-4 text-emerald-500" /> : <Eye className="size-4" style={{ color: "#a855f7" }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[color:var(--foreground)]">Cek index Google</p>
                  <p className="text-[10px]" style={{ color: stats.indexedDomains > 0 ? "#10b981" : "var(--muted-foreground)" }}>{stats.indexedDomains} terindex</p>
                </div>
                <button onClick={() => runTask("index")} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-150 hover:scale-110" style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)", color: "#ffffff" }}>
                  <ArrowRight className="size-3.5" />
                </button>
              </div>

              {/* Task 4: Sebar backlinks — scheduler also handles this */}
              {(() => {
                const limit = stats.backlinkDailyLimit ?? 15
                const placed = stats.todayBacklinks ?? 0
                const auto = stats.schedulerRunning
                const done = placed >= limit
                return (
                  <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ borderColor: done ? "rgba(16,185,129,0.3)" : "var(--border)", background: done ? "rgba(16,185,129,0.1)" : auto ? "rgba(236,72,153,0.1)" : "rgba(245,158,11,0.1)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: done ? "rgba(16,185,129,0.15)" : auto ? "rgba(236,72,153,0.15)" : "rgba(245,158,11,0.15)" }}>
                      {done ? <CheckCircle2 className="size-4 text-emerald-500" /> : auto ? <Clock className="size-4" style={{ color: "#ec4899" }} /> : <Link2 className="size-4" style={{ color: "#f59e0b" }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[color:var(--foreground)]">{done ? "Backlink penuh" : "Sebar backlink"}</p>
                      <p className="text-[10px]" style={{ color: done ? "#10b981" : auto ? "#ec4899" : "var(--muted-foreground)" }}>
                        {placed}/{limit} hari ini{auto && !done ? " (otomatis)" : ""}
                      </p>
                    </div>
                    {done ? (
                      <span className="text-[10px] font-medium px-2 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>Done</span>
                    ) : auto ? (
                      <span className="text-[10px] font-medium px-2 py-1 rounded-full" style={{ background: "rgba(236,72,153,0.1)", color: "#ec4899" }}>Auto</span>
                    ) : (
                      <button onClick={() => runTask("backlinks")} disabled={taskRunning !== null} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-150 hover:scale-110" style={{ background: "linear-gradient(135deg, #ec4899, #db2777)", color: "#ffffff", opacity: taskRunning ? 0.5 : 1 }}>
                        {taskRunning === "backlinks" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                      </button>
                    )}
                  </div>
                )
              })()}

              {/* Task 5: Health check — always manual */}
              {(() => {
                const done = stats.deadDomains === 0 && stats.aliveDomains > 0
                return (
                  <div className="flex items-center gap-2 p-3 rounded-lg border" style={{ borderColor: done ? "rgba(16,185,129,0.3)" : "var(--border)", background: done ? "rgba(16,185,129,0.1)" : stats.deadDomains > 0 ? "rgba(239,68,68,0.1)" : "rgba(100,116,139,0.08)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: done ? "rgba(16,185,129,0.15)" : stats.deadDomains > 0 ? "rgba(239,68,68,0.15)" : "rgba(100,116,139,0.15)" }}>
                      {done ? <CheckCircle2 className="size-4 text-emerald-500" /> : <Heart className="size-4" style={{ color: stats.deadDomains > 0 ? "#ef4444" : "var(--muted-foreground)" }} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[color:var(--foreground)]">{done ? "Semua sehat" : "Health check"}</p>
                      <p className="text-[10px]" style={{ color: done ? "#10b981" : stats.deadDomains > 0 ? "#ef4444" : "var(--muted-foreground)" }}>
                        {done ? `${stats.aliveDomains} alive` : `${stats.deadDomains} mati`}
                      </p>
                    </div>
                    {done ? (
                      <span className="text-[10px] font-medium px-2 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>OK</span>
                    ) : (
                      <button onClick={() => runTask("health")} disabled={taskRunning !== null} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-150 hover:scale-110" style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#ffffff", opacity: taskRunning ? 0.5 : 1 }}>
                        {taskRunning === "health" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
          </FunCard>
        )}

        {/* ═══════ Main Stats Grid ═══════ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-tour="stat-cards">
          {/* Server */}
          <FunCard delay={100} className="group">
            <Link href="/servers">
              <div className="rounded-xl border border-[color:var(--border)] bg-white p-5 h-full relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-[#0ea5e9]/8 to-transparent rounded-bl-full" />
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#0ea5e9]/15 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                    <Server className="h-5 w-5 text-[#0ea5e9]" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-[color:var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1" />
                </div>
                <p className="text-3xl font-extrabold text-[color:var(--foreground)]">{loading ? "—" : <AnimatedNumber value={stats?.totalServers ?? 0} />}</p>
                <p className="text-sm text-[color:var(--muted-foreground)] mt-1">Server</p>
              </div>
            </Link>
          </FunCard>

          {/* Domain */}
          <FunCard delay={200} className="group">
            <Link href="/domains">
              <div className="rounded-xl border border-[color:var(--border)] bg-white p-5 h-full relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-[#84cc16]/10 to-transparent rounded-bl-full" />
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#84cc16]/15 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                    <Globe className="h-5 w-5 text-[#84cc16]" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-[color:var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1" />
                </div>
                <p className="text-3xl font-extrabold text-[color:var(--foreground)]">{loading ? "—" : <AnimatedNumber value={stats?.totalDomains ?? 0} />}</p>
                <p className="text-sm text-[color:var(--muted-foreground)] mt-1">Domain</p>
              </div>
            </Link>
          </FunCard>

          {/* Artikel */}
          <FunCard delay={300} className="group">
            <Link href="/articles">
              <div className="rounded-xl border border-[color:var(--border)] bg-white p-5 h-full relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-[#f59e0b]/10 to-transparent rounded-bl-full" />
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#f59e0b]/15 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                    <FileText className="h-5 w-5 text-[#f59e0b]" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-[color:var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1" />
                </div>
                <p className="text-3xl font-extrabold text-[color:var(--foreground)]">{loading ? "—" : <AnimatedNumber value={stats?.totalArticles ?? 0} duration={1500} />}</p>
                <p className="text-sm text-[color:var(--muted-foreground)] mt-1">Artikel</p>
              </div>
            </Link>
          </FunCard>

          {/* Backlinks */}
          <FunCard delay={400} className="group">
            <Link href="/backlinks">
              <div className="rounded-xl border border-[color:var(--border)] bg-white p-5 h-full relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-[#ec4899]/10 to-transparent rounded-bl-full" />
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-[#ec4899]/15 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
                    <Link2 className="h-5 w-5 text-[#ec4899]" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-[color:var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1" />
                </div>
                <p className="text-3xl font-extrabold text-[color:var(--foreground)]">{loading ? "—" : <AnimatedNumber value={stats?.totalBacklinks ?? 0} />}</p>
                <p className="text-sm text-[color:var(--muted-foreground)] mt-1">Backlink</p>
              </div>
            </Link>
          </FunCard>
        </div>

        {/* ═══════ Second Row: Readiness + Health + Deploy ═══════ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Domain Readiness Donut */}
          <FunCard delay={500}>
          <div className="rounded-xl border border-[color:var(--border)] bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--foreground)]">Kesiapan Deploy</h3>
                <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">Domain yang sudah live</p>
              </div>
              <Activity className="size-4 text-[#0ea5e9]" />
            </div>
            <div className="flex items-center justify-center py-2">
              <DonutChart percentage={loading ? 0 : readinessPercent} label="Deployed" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="rounded-lg px-3 py-2" style={{ background: "rgba(14,165,233,0.06)" }}>
                <p className="text-lg font-bold text-[#0ea5e9]">{loading ? "—" : deployedCount}</p>
                <p className="text-[10px] text-[color:var(--muted-foreground)]">Domain live total</p>
                {!loading && (stats?.todayDeploys ?? 0) > 0 && (
                  <p className="text-[9px] font-medium mt-0.5" style={{ color: "#10b981" }}>
                    +{stats?.todayDeploys} deploy hari ini
                  </p>
                )}
              </div>
              <div className="rounded-lg px-3 py-2" style={{ background: "rgba(245,158,11,0.06)" }}>
                <p className="text-lg font-bold text-[#f59e0b]">{loading ? "—" : totalDomains - deployedCount}</p>
                <p className="text-[10px] text-[color:var(--muted-foreground)]">Belum deploy</p>
              </div>
            </div>
          </div>
          </FunCard>

          {/* Health Overview */}
          <FunCard delay={600}>
          <div className="rounded-xl border border-[color:var(--border)] bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--foreground)]">Kesehatan Domain</h3>
                <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">Status alive/dead dari health check</p>
              </div>
              <Heart className="size-4 text-[#ef4444]" />
            </div>
            <div className="space-y-3">
              <MiniStat icon={CheckCircle2} label="Domain Alive" value={loading ? "—" : stats?.aliveDomains ?? 0} color="#10b981" href="/health-check" />
              <MiniStat icon={XCircle} label="Domain Dead" value={loading ? "—" : stats?.deadDomains ?? 0} color="#ef4444" href="/health-check" />
              <MiniStat icon={Eye} label="Terindex Google" value={loading ? "—" : stats?.indexedDomains ?? 0} color="#a855f7" href="/index-monitor" />
            </div>
          </div>
          </FunCard>

          {/* Quick Actions */}
          <FunCard delay={700}>
          <div className="rounded-xl border border-[color:var(--border)] bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--foreground)]">Aksi Cepat</h3>
                <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">Pintasan ke fitur utama</p>
              </div>
              <Zap className="size-4 text-[#f59e0b]" />
            </div>
            <div className="space-y-2">
              <button
                onClick={() => router.push("/deploy/bulk")}
                data-tour="btn-add-domain"
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[color:var(--background)] transition-all duration-300 text-left hover:translate-x-1"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#0ea5e9] to-[#0284c7] flex items-center justify-center shrink-0 shadow-md shadow-[#0ea5e9]/20">
                  <Rocket className="size-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[color:var(--foreground)]">Bulk Deploy</p>
                  <p className="text-[10px] text-[color:var(--muted-foreground)]">Deploy batch 10-15 domain</p>
                </div>
              </button>
              <button
                onClick={() => router.push("/articles/ai-generate")}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[color:var(--background)] transition-all duration-300 text-left hover:translate-x-1"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#84cc16] to-[#65a30d] flex items-center justify-center shrink-0 shadow-md shadow-[#84cc16]/20">
                  <FileText className="size-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[color:var(--foreground)]">AI Generate</p>
                  <p className="text-[10px] text-[color:var(--muted-foreground)]">Buat artikel dengan Claude AI</p>
                </div>
              </button>
              <button
                onClick={() => router.push("/scheduler")}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[color:var(--background)] transition-all duration-300 text-left hover:translate-x-1"
              >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] flex items-center justify-center shrink-0 shadow-md shadow-[#8b5cf6]/20">
                  <Clock className="size-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[color:var(--foreground)]">Scheduler</p>
                  <p className="text-[10px] text-[color:var(--muted-foreground)]">Autopilot: artikel + deploy + cache</p>
                </div>
              </button>
            </div>
          </div>
          </FunCard>
        </div>

        {/* ═══════ Recent Domains Table ═══════ */}
        <FunCard delay={800}>
        <Card className="rounded-xl border border-[color:var(--border)] bg-white overflow-hidden" data-tour="domain-table">
          <CardHeader className="flex flex-row items-center justify-between px-6 py-5 border-b border-[color:var(--border)]">
            <div>
              <CardTitle className="text-lg font-semibold text-[color:var(--foreground)]">Domain Terbaru</CardTitle>
              <p className="text-xs text-[color:var(--muted-foreground)] mt-0.5">{domains.length} domain terdaftar</p>
            </div>
            <Button
              variant="ghost" size="sm"
              onClick={() => router.push("/domains")}
              className="text-[#0ea5e9] hover:text-[#0ea5e9] hover:bg-[#0ea5e9]/10"
            >
              Lihat Semua <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 text-center">
                <div className="inline-flex items-center gap-2 text-[color:var(--muted-foreground)]">
                  <div className="w-4 h-4 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
                  Memuat data...
                </div>
              </div>
            ) : domains.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#0ea5e9]/10 flex items-center justify-center mx-auto mb-4">
                  <Globe className="h-8 w-8 text-[#0ea5e9]" />
                </div>
                <h3 className="text-lg font-semibold text-[color:var(--foreground)] mb-2">Belum ada domain</h3>
                <p className="text-sm text-[color:var(--muted-foreground)] mb-5 max-w-sm mx-auto">
                  Tambahkan domain PBN pertama Anda untuk memulai.
                </p>
                <Button onClick={() => router.push("/domains/new")} className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white">
                  <Plus className="h-4 w-4 mr-2" /> Tambah Domain
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-[color:var(--border)] hover:bg-transparent">
                      <TableHead className="text-xs font-medium text-[color:var(--muted-foreground)] uppercase tracking-wider pl-6">Domain</TableHead>
                      <TableHead className="text-xs font-medium text-[color:var(--muted-foreground)] uppercase tracking-wider">Genre</TableHead>
                      <TableHead className="text-xs font-medium text-[color:var(--muted-foreground)] uppercase tracking-wider">Artikel</TableHead>
                      <TableHead className="text-xs font-medium text-[color:var(--muted-foreground)] uppercase tracking-wider">Health</TableHead>
                      <TableHead className="text-xs font-medium text-[color:var(--muted-foreground)] uppercase tracking-wider">Deploy</TableHead>
                      <TableHead className="text-xs font-medium text-[color:var(--muted-foreground)] uppercase tracking-wider pr-6">Tanggal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {domains.slice(0, 8).map((domain) => (
                      <TableRow key={domain.id} className="border-b border-[color:var(--border)] hover:bg-[#0ea5e9]/[0.03] transition-colors">
                        <TableCell className="pl-6 py-3">
                          <Link href={`/domains/${domain.id}`} className="font-medium text-[color:var(--foreground)] hover:text-[#0ea5e9] transition-colors">
                            {domain.name}
                          </Link>
                          <p className="text-[10px] text-[color:var(--muted-foreground)] mt-0.5">{domain.url.replace(/^https?:\/\//, "")}</p>
                        </TableCell>
                        <TableCell>
                          {domain.genre ? (
                            <Badge variant="outline" className="text-[10px] border-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>{domain.genre}</Badge>
                          ) : <span className="text-[color:var(--muted-foreground)]">-</span>}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium text-[color:var(--foreground)]">{domain._count.articles}</span>
                        </TableCell>
                        <TableCell>
                          {domain.isAlive ? (
                            <Badge variant="outline" className="text-[10px] border-0" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Alive</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-0" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>Dead</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {domain.lastDeployed ? (
                            <Badge variant="outline" className="text-[10px] border-0" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9" }}>Deployed</Badge>
                          ) : (
                            <span className="text-[10px] text-[color:var(--muted-foreground)]">Belum</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-6 text-xs text-[color:var(--muted-foreground)]">
                          {domain.lastDeployed
                            ? new Date(domain.lastDeployed).toLocaleDateString("id-ID", { day: "numeric", month: "short" })
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        </FunCard>
      </div>
    </SidebarInset>
  );
}
