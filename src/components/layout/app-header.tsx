"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { TutorialButton } from "@/components/tutorial/tutorial-button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { NotificationBell } from "@/components/ui/notification-bell"
import { Search } from "lucide-react"

interface AppHeaderProps {
  title?: string
}

export function AppHeader({ title = "Dasbor" }: AppHeaderProps) {
  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between px-4 md:px-6"
      style={{ borderBottom: "1px solid #e2e8f0" }}
    >
      {/* Left: sidebar trigger + page title */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="-ml-1 hover:bg-black/5 transition-colors" />
        <div
          className="mx-1 h-5 w-px"
          style={{ background: "var(--border)" }}
        />
        <h1
          className="text-lg font-bold tracking-tight"
          style={{ color: "var(--foreground)" }}
        >
          {title}
        </h1>
      </div>

      {/* Right: search + bell + tutorial */}
      <div className="flex items-center gap-1.5 md:gap-2">
        {/* Search input */}
        <div className="relative hidden sm:block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4"
            style={{ color: "var(--muted-foreground)" }}
          />
          <input
            type="text"
            placeholder="Cari..."
            className="h-9 w-48 rounded-full border pl-9 pr-4 text-sm outline-none transition-all duration-200 focus:w-64 focus:ring-2 focus:ring-teal-500/30"
            style={{
              background: "var(--muted)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
          />
        </div>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Notification bell */}
        <NotificationBell />

        {/* Divider */}
        <div
          className="mx-0.5 h-5 w-px hidden md:block"
          style={{ background: "var(--border)" }}
        />

        {/* Tutorial button */}
        <TutorialButton />
      </div>
    </header>
  )
}
