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
  Map as MapIcon,
  Terminal,
  ListOrdered,
  Zap,
  Newspaper,
  Rss,
  Tag,
  ShieldAlert,
  Gamepad2,
  TrendingUp,
} from "lucide-react"
import { useMe } from "@/hooks/use-me"
import { AvatarDisplay } from "@/components/ui/avatar-display"
import { useConfirm } from "@/components/ui/confirm-modal"

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
  healthyServers?: number
  adultDomains?: number
  iGamingDomains?: number
  rankKeywordsActive?: number
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
  adminOnly?: boolean // hidden from operator users
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
    label: "KELOLA",
    items: [
      { title: "Dasbor", href: "/", icon: LayoutDashboard, tourId: "nav-dashboard" },
      {
        title: "Domain",
        href: "/domains",
        icon: Globe,
        tourId: "nav-domain",
        badge: (s) => fmtCount(s?.totalDomains),
        badgeTone: () => "lime",
      },
      {
        title: "Adult Domains",
        href: "/domains/adult",
        icon: ShieldAlert,
        tourId: "nav-domain-adult",
        // Badge only renders when there's at least one quarantined domain —
        // the sidebar stays clean when the pool is clean.
        badge: (s) => (s?.adultDomains && s.adultDomains > 0 ? fmtCount(s.adultDomains) : null),
        badgeTone: () => "red",
      },
      {
        title: "iGaming Domains",
        href: "/domains/igaming",
        icon: Gamepad2,
        tourId: "nav-domain-igaming",
        // Purple-pinned iGaming bucket — only shows count when operator has
        // actually pinned domains. Keeps the sidebar clean for niches that
        // aren't in use yet.
        badge: (s) => (s?.iGamingDomains && s.iGamingDomains > 0 ? fmtCount(s.iGamingDomains) : null),
        badgeTone: () => "purple",
      },
      {
        title: "Artikel",
        href: "/articles",
        icon: FileText,
        tourId: "nav-articles",
        badge: (s) => fmtCount(s?.totalArticles),
        badgeTone: () => "amber",
      },
      { title: "Tema", href: "/themes", icon: Palette, tourId: "nav-themes" },
      {
        title: "Backlink",
        href: "/backlinks",
        icon: Link2,
        tourId: "nav-backlinks",
        badge: (s) => s ? `${s.todayBacklinks}/${s.backlinkDailyLimit}` : null,
        badgeTone: () => "pink",
        adminOnly: true,
      },
      {
        title: "Deploy",
        href: "/deploy",
        icon: Rocket,
        tourId: "nav-deploy",
        badge: (s) => fmtCount(s?.deployedDomains),
        badgeTone: () => "teal",
      },
      {
        title: "Migrasi",
        href: "/migration",
        icon: MapIcon,
        tourId: "nav-migration",
        badge: (s) => s ? `${s.deployedDomains}/${s.totalDomains}` : null,
        badgeTone: () => "teal",
      },
      {
        title: "Queue",
        href: "/provisioning/queue",
        icon: ListOrdered,
        tourId: "nav-provisioning-queue",
        adminOnly: true,
      },
      {
        title: "Stress Tests",
        href: "/provisioning/stress-tests",
        icon: Zap,
        tourId: "nav-stress-tests",
        adminOnly: true,
      },
    ],
  },
  {
    label: "KONTEN",
    items: [
      {
        title: "Content Pipeline",
        href: "/content",
        icon: Newspaper,
        tourId: "nav-content",
      },
      {
        title: "Niche Mapping",
        href: "/content/niches",
        icon: Tag,
        tourId: "nav-content-niches",
      },
      {
        title: "Sumber Konten",
        href: "/content/rss-sources",
        icon: Rss,
        tourId: "nav-content-rss",
      },
    ],
  },
  {
    label: "SEO",
    items: [
      {
        title: "Rank Tracker",
        href: "/seo/ranks",
        icon: TrendingUp,
        tourId: "nav-seo-ranks",
        // Active-keyword count. Hidden when zero so the badge doesn't dangle
        // empty — same pattern as adult/igaming bukets above.
        badge: (s) =>
          s?.rankKeywordsActive && s.rankKeywordsActive > 0
            ? fmtCount(s.rankKeywordsActive)
            : null,
        badgeTone: () => "teal",
      },
    ],
  },
  {
    label: "SISTEM",
    items: [
      {
        title: "Server",
        href: "/servers",
        icon: Server,
        tourId: "nav-server",
        badge: (s) => fmtCount(s?.totalServers),
        badgeTone: () => "teal",
        adminOnly: true,
      },
      {
        title: "Provisioning",
        href: "/provisioning",
        icon: Terminal,
        tourId: "nav-provisioning",
        badge: (s) => (s ? `${s.healthyServers}/${s.totalServers}` : null),
        badgeTone: () => "teal",
        adminOnly: true,
      },
      { title: "Import", href: "/import", icon: Upload, tourId: "nav-import" },
      { title: "Cloudflare", href: "/cloudflare", icon: Cloud, tourId: "nav-cloudflare" },
      {
        title: "Health Check",
        href: "/health-check",
        icon: Heart,
        tourId: "nav-health",
        badge: (s) => (s?.deadDomains ? fmtCount(s.deadDomains) : null),
        badgeTone: (s) => (s && s.deadDomains > 0 ? "red" : "muted"),
      },
      {
        title: "Scheduler",
        href: "/scheduler",
        icon: Clock,
        tourId: "nav-scheduler",
        pulse: (s) => !!s?.schedulerRunning,
      },
      {
        title: "Index Monitor",
        href: "/index-monitor",
        icon: Eye,
        tourId: "nav-index",
        badge: (s) => fmtCount(s?.indexedDomains),
        badgeTone: () => "lime",
      },
      { title: "Google Ping", href: "/google-ping", icon: Search, tourId: "nav-ping" },
      {
        title: "Activity Log",
        href: "/activity-log",
        icon: Activity,
        tourId: "nav-activity-log",
        adminOnly: true,
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
  const confirm = useConfirm()

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
    const ok = await confirm({
      title: "Yakin mau keluar?",
      message: "Kamu akan logout dan harus login ulang.",
      confirmText: "Ya, keluar",
      variant: "danger",
    })
    if (!ok) return
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
        <Link href="/" className="group/logo flex items-center gap-2 px-1">
          {/* Light-mode logo — hidden in dark via class:dark:hidden */}
          <img
            src="/pbn-logo-light.png"
            alt="PBN ROKET"
            className="block dark:hidden h-9 w-auto transition-transform duration-300 group-hover/logo:scale-105"
          />
          {/* Dark-mode logo — shown only in dark */}
          <img
            src="/pbn-logo-dark.png"
            alt="PBN ROKET"
            className="hidden dark:block h-9 w-auto transition-transform duration-300 group-hover/logo:scale-105"
          />
        </Link>
      </SidebarHeader>

      {/* ── Main Navigation (grouped) ── */}
      <SidebarContent className="px-1.5 py-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[rgba(14,165,233,0.25)] hover:[&::-webkit-scrollbar-thumb]:bg-[rgba(14,165,233,0.5)]">
        {MENU_GROUPS.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.adminOnly || me?.role === "admin"
          )
          if (visibleItems.length === 0) return null
          return (
          <SidebarGroup key={group.label} className="px-0 py-1">
            <SidebarGroupLabel className="px-2 text-[9px] font-bold tracking-[0.14em] text-[color:var(--muted-foreground)] opacity-70">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {visibleItems.map((item) => {
                  // Match rules:
                  // - "/" must match exactly (otherwise it would match every path).
                  // - For other items, accept exact match OR path prefix on a slash
                  //   boundary (e.g. "/content" matches "/content/foo" but NOT "/contents").
                  // - If a sibling item has a more specific (longer) match, yield to it
                  //   so child rows don't double-highlight with their parent.
                  const matches = (href: string) => {
                    if (href === "/") return pathname === "/"
                    return pathname === href || pathname.startsWith(href + "/")
                  }
                  const selfMatches = matches(item.href)
                  const hasMoreSpecificSibling = selfMatches
                    ? visibleItems.some(
                        (other) =>
                          other.href !== item.href &&
                          other.href.length > item.href.length &&
                          matches(other.href)
                      )
                    : false
                  const isActive = selfMatches && !hasMoreSpecificSibling
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
          )
        })}
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

          {/* Current user — clickable, goes to profile page */}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={me ? `${me.name || me.username} (${me.role}) — klik untuk edit profil` : "Profil"}
              render={<Link href="/profile" />}
              className="rounded-lg text-[color:var(--muted-foreground)] transition-all duration-200 ease-out hover:bg-[rgba(14,165,233,0.08)] hover:text-[#0ea5e9] cursor-pointer"
            >
              {me ? (
                <AvatarDisplay
                  avatarId={me.avatarId}
                  name={me.name}
                  username={me.username}
                  role={me.role}
                  size="sm"
                  className="!w-5 !h-5"
                />
              ) : (
                <span
                  className="flex shrink-0 items-center justify-center rounded-full size-5 ring-1 ring-[color:var(--border)]"
                  style={{ background: "var(--muted)" }}
                >
                  <User className="size-3" style={{ color: "var(--muted-foreground)" }} />
                </span>
              )}
              <span className="text-xs truncate">
                {me ? me.name || me.username : "Loading..."}
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
