"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  LayoutDashboard,
  Globe,
  FileText,
  Palette,
  Rocket,
  Settings,
  Server,
  User,
  Link2,
  Upload,
  Cloud,
  Heart,
  Clock,
  HelpCircle,
  Search,
  Eye,
  LogOut,
  Activity,
} from "lucide-react"
import { useMe } from "@/hooks/use-me"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"

// ── Live stats fetched from /api/stats (used for badges + bottom card) ──
type SidebarStats = {
  totalServers: number
  totalDomains: number
  totalArticles: number
  deadDomains: number
  deployedDomains: number
  indexedDomains: number
  schedulerRunning: boolean
  todayArticles: number
  todayDeploys: number
  todayBacklinks: number
  backlinkDailyLimit: number
}

type BadgeTone = "teal" | "lime" | "red" | "amber" | "purple" | "pink" | "muted"

const BADGE_TONE: Record<BadgeTone, { bg: string; fg: string }> = {
  teal: { bg: "rgba(14,165,233,0.12)", fg: "#0ea5e9" },
  lime: { bg: "rgba(132,204,22,0.15)", fg: "#65a30d" },
  red: { bg: "rgba(239,68,68,0.12)", fg: "#ef4444" },
  amber: { bg: "rgba(245,158,11,0.12)", fg: "#d97706" },
  purple: { bg: "rgba(168,85,247,0.12)", fg: "#a855f7" },
  pink: { bg: "rgba(236,72,153,0.12)", fg: "#ec4899" },
  muted: { bg: "rgba(100,116,139,0.1)", fg: "#64748b" },
}

type NavItem = {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  tourId: string
  badge?: (s: SidebarStats | null) => string | null
  badgeTone?: (s: SidebarStats | null) => BadgeTone
  pulse?: (s: SidebarStats | null) => boolean // show pulsing dot
}

type NavGroup = {
  label: string
  items: NavItem[]
}

function fmtCount(n: number | undefined): string | null {
  if (n === undefined || n === null) return null
  if (n >= 10_000) return `${Math.floor(n / 1000)}K`
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

const MENU_GROUPS: NavGroup[] = [
  {
    label: "DATA",
    items: [
      { title: "Dasbor", href: "/", icon: LayoutDashboard, tourId: "nav-dashboard" },
      {
        title: "Server",
        href: "/servers",
        icon: Server,
        tourId: "nav-server",
        badge: (s) => fmtCount(s?.totalServers),
        badgeTone: () => "teal",
      },
      {
        title: "Domain",
        href: "/domains",
        icon: Globe,
        tourId: "nav-domain",
        badge: (s) => fmtCount(s?.totalDomains),
        badgeTone: () => "lime",
      },
      {
        title: "Artikel",
        href: "/articles",
        icon: FileText,
        tourId: "nav-articles",
        badge: (s) => fmtCount(s?.totalArticles),
        badgeTone: () => "amber",
      },
    ],
  },
  {
    label: "CONTENT",
    items: [
      { title: "Tema", href: "/themes", icon: Palette, tourId: "nav-themes" },
      {
        title: "Backlink",
        href: "/backlinks",
        icon: Link2,
        tourId: "nav-backlinks",
        badge: (s) =>
          s ? `${s.todayBacklinks}/${s.backlinkDailyLimit}` : null,
        badgeTone: () => "pink",
      },
    ],
  },
  {
    label: "OPERATIONS",
    items: [
      {
        title: "Deploy",
        href: "/deploy",
        icon: Rocket,
        tourId: "nav-deploy",
        badge: (s) => fmtCount(s?.deployedDomains),
        badgeTone: () => "teal",
      },
      { title: "Cloudflare", href: "/cloudflare", icon: Cloud, tourId: "nav-cloudflare" },
      { title: "Import", href: "/import", icon: Upload, tourId: "nav-import" },
    ],
  },
  {
    label: "MONITORING",
    items: [
      {
        title: "Health Check",
        href: "/health-check",
        icon: Heart,
        tourId: "nav-health",
        badge: (s) => (s?.deadDomains ? fmtCount(s.deadDomains) : null),
        badgeTone: (s) => (s && s.deadDomains > 0 ? "red" : "muted"),
      },
      { title: "Google Ping", href: "/google-ping", icon: Search, tourId: "nav-ping" },
      {
        title: "Index Monitor",
        href: "/index-monitor",
        icon: Eye,
        tourId: "nav-index",
        badge: (s) => fmtCount(s?.indexedDomains),
        badgeTone: () => "lime",
      },
      {
        title: "Scheduler",
        href: "/scheduler",
        icon: Clock,
        tourId: "nav-scheduler",
        pulse: (s) => !!s?.schedulerRunning,
      },
    ],
  },
]

const bottomItems = [
  { title: "Panduan", href: "/guide", icon: HelpCircle, tourId: "nav-guide" },
  { title: "Pengaturan", href: "/settings", icon: Settings, tourId: "nav-settings" },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { me } = useMe()

  const [stats, setStats] = useState<SidebarStats | null>(null)
  const [clock, setClock] = useState<string | null>(null)

  // Fetch live stats, refresh every 30s
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/stats")
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setStats(data)
      } catch {}
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  // Live clock (client-only to avoid hydration mismatch)
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        })
      )
    tick()
    const id = setInterval(tick, 1000 * 30) // 30s is enough for HH:MM display
    return () => clearInterval(id)
  }, [])

  const visibleBottomItems = bottomItems.filter(
    (item) => item.href !== "/settings" || me?.role === "admin"
  )

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r-0 transition-all duration-300 ease-in-out"
    >
      {/* ── Logo ── */}
      <SidebarHeader className="h-14 items-center justify-center border-b border-[color:var(--border)]">
        <Link href="/" className="group/logo flex items-center gap-2.5 px-1">
          <span
            className={[
              "flex shrink-0 items-center justify-center rounded-xl",
              "size-8 bg-gradient-to-br from-[#0ea5e9] to-[#0284c7]",
              "text-sm font-extrabold text-white",
              "shadow-[0_0_12px_rgba(14,165,233,0.35)]",
              "transition-all duration-300 group-hover/logo:shadow-[0_0_20px_rgba(14,165,233,0.5)] group-hover/logo:scale-110 group-hover/logo:rotate-3",
            ].join(" ")}
          >
            P
          </span>
          <span className="truncate text-sm font-semibold tracking-tight text-[color:var(--secondary-foreground)]">
            PBN Manager
          </span>
        </Link>
      </SidebarHeader>

      {/* ── Main Navigation (grouped) ── */}
      <SidebarContent className="px-1.5 py-2">
        {MENU_GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="px-0 py-1">
            <SidebarGroupLabel className="px-2 text-[9px] font-bold tracking-[0.14em] text-[color:var(--muted-foreground)] opacity-70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href)
                  const badgeText = item.badge ? item.badge(stats) : null
                  const badgeTone: BadgeTone = item.badgeTone
                    ? item.badgeTone(stats)
                    : "muted"
                  const pulsing = item.pulse ? item.pulse(stats) : false
                  const tone = BADGE_TONE[badgeTone]

                  return (
                    <SidebarMenuItem key={item.title} data-tour={item.tourId}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.title}
                        render={<Link href={item.href} />}
                        className={[
                          "relative rounded-lg transition-all duration-200 ease-out",
                          "text-[color:var(--muted-foreground)] hover:text-[color:var(--secondary-foreground)]",
                          "hover:bg-[rgba(14,165,233,0.06)]",
                          isActive
                            ? [
                                "!bg-[rgba(14,165,233,0.10)] !text-[#0ea5e9] !font-semibold",
                                "before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-[#0ea5e9]",
                                "before:shadow-[0_0_8px_rgba(14,165,233,0.6)]",
                                "shadow-[inset_0_0_12px_rgba(14,165,233,0.06)]",
                              ].join(" ")
                            : "",
                        ].join(" ")}
                      >
                        <item.icon
                          className={[
                            "transition-all duration-200",
                            isActive
                              ? "text-[#0ea5e9] drop-shadow-[0_0_6px_rgba(14,165,233,0.5)]"
                              : "",
                          ].join(" ")}
                        />
                        <span className="flex-1">{item.title}</span>

                        {/* Live badge */}
                        {badgeText && (
                          <span
                            className="ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums leading-none"
                            style={{
                              background: tone.bg,
                              color: tone.fg,
                            }}
                          >
                            {badgeText}
                          </span>
                        )}

                        {/* Pulsing dot for active statuses (scheduler running) */}
                        {pulsing && (
                          <span className="ml-auto relative flex size-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* ── Bottom Section ── */}
      <SidebarFooter className="border-t border-[color:var(--border)] px-1.5 py-2 space-y-1.5">
        {/* Live stats card */}
        {stats && (
          <div
            className="rounded-lg border px-2.5 py-2"
            style={{
              background:
                "linear-gradient(135deg, rgba(14,165,233,0.06), rgba(132,204,22,0.06))",
              borderColor: "rgba(14,165,233,0.15)",
            }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Clock className="size-3" style={{ color: "#0ea5e9" }} />
                <span
                  className="text-[11px] font-mono font-semibold tabular-nums"
                  style={{ color: "var(--foreground)" }}
                >
                  {clock || "--:--"}
                </span>
              </div>
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={{
                  background: stats.schedulerRunning
                    ? "rgba(16,185,129,0.15)"
                    : "rgba(100,116,139,0.12)",
                  color: stats.schedulerRunning ? "#10b981" : "#64748b",
                }}
              >
                <span
                  className="inline-block size-1.5 rounded-full"
                  style={{
                    background: stats.schedulerRunning ? "#10b981" : "#94a3b8",
                    boxShadow: stats.schedulerRunning
                      ? "0 0 6px rgba(16,185,129,0.6)"
                      : undefined,
                  }}
                />
                {stats.schedulerRunning ? "LIVE" : "OFF"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <div
                  className="text-[13px] font-bold tabular-nums"
                  style={{ color: "#0ea5e9" }}
                >
                  {stats.todayArticles}
                </div>
                <div
                  className="text-[8px] uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Artikel
                </div>
              </div>
              <div>
                <div
                  className="text-[13px] font-bold tabular-nums"
                  style={{ color: "#84cc16" }}
                >
                  {stats.todayDeploys}
                </div>
                <div
                  className="text-[8px] uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Deploy
                </div>
              </div>
              <div>
                <div
                  className="text-[13px] font-bold tabular-nums"
                  style={{ color: "#ec4899" }}
                >
                  {stats.todayBacklinks}
                </div>
                <div
                  className="text-[8px] uppercase tracking-wider"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Link
                </div>
              </div>
            </div>
          </div>
        )}

        <SidebarMenu className="gap-1">
          {/* Guide / Settings */}
          {visibleBottomItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <SidebarMenuItem key={item.title} data-tour={item.tourId}>
                <SidebarMenuButton
                  isActive={isActive}
                  tooltip={item.title}
                  render={<Link href={item.href} />}
                  className={[
                    "relative rounded-lg transition-all duration-200 ease-out",
                    "text-[color:var(--muted-foreground)] hover:text-[color:var(--secondary-foreground)]",
                    "hover:bg-[rgba(14,165,233,0.06)]",
                    isActive
                      ? [
                          "!bg-[rgba(14,165,233,0.10)] !text-[#0ea5e9] !font-semibold",
                          "before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:rounded-full before:bg-[#0ea5e9]",
                          "before:shadow-[0_0_8px_rgba(14,165,233,0.6)]",
                        ].join(" ")
                      : "",
                  ].join(" ")}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}

          <SidebarSeparator className="mx-0 my-1 bg-[color:var(--border)]" />

          {/* Current user */}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={me ? `${me.name || me.username} (${me.role})` : "Profil"}
              className="rounded-lg text-[color:var(--muted-foreground)] pointer-events-none"
            >
              <span
                className="flex shrink-0 items-center justify-center rounded-full size-5 ring-1 ring-[color:var(--border)] text-[10px] font-bold text-white"
                style={{
                  background:
                    me?.role === "admin"
                      ? "linear-gradient(135deg, #0ea5e9, #0284c7)"
                      : "linear-gradient(135deg, #64748b, #475569)",
                }}
              >
                {me ? (
                  (me.name || me.username).charAt(0).toUpperCase()
                ) : (
                  <User className="size-3" />
                )}
              </span>
              <span className="text-xs truncate">
                {me ? me.name || me.username : "..."}
                {me && (
                  <span className="ml-1 text-[9px] opacity-60 uppercase">
                    {me.role}
                  </span>
                )}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Keluar"
              onClick={handleLogout}
              className="rounded-lg text-[color:var(--muted-foreground)] transition-all duration-200 ease-out hover:bg-[rgba(239,68,68,0.08)] hover:text-[#dc2626] cursor-pointer"
            >
              <LogOut className="size-4" />
              <span className="text-xs">Keluar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
