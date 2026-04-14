"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { LogOut, Settings, Shield, User as UserIcon } from "lucide-react"
import { useMe } from "@/hooks/use-me"

export function UserMenu() {
  const router = useRouter()
  const { me } = useMe()
  const [open, setOpen] = useState(false)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest("[data-user-menu]")) setOpen(false)
    }
    document.addEventListener("click", handler)
    return () => document.removeEventListener("click", handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  const initial = me
    ? (me.name || me.username).charAt(0).toUpperCase()
    : null
  const isAdmin = me?.role === "admin"

  return (
    <div className="relative" data-user-menu>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white select-none transition-all hover:scale-105 hover:shadow-lg"
        style={{
          background: isAdmin
            ? "linear-gradient(135deg, #0ea5e9, #84cc16)"
            : "linear-gradient(135deg, #64748b, #475569)",
          boxShadow: open
            ? "0 0 0 3px rgba(14,165,233,0.25)"
            : undefined,
        }}
        title={me ? `${me.name || me.username} (${me.role})` : "Profil"}
      >
        {initial ?? <UserIcon className="size-4" />}
      </button>

      {open && me && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-xl border shadow-2xl z-50 overflow-hidden"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center gap-3"
            style={{
              background:
                "linear-gradient(135deg, rgba(14,165,233,0.08), rgba(132,204,22,0.08))",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
              style={{
                background: isAdmin
                  ? "linear-gradient(135deg, #0ea5e9, #84cc16)"
                  : "linear-gradient(135deg, #64748b, #475569)",
              }}
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-sm font-semibold truncate"
                style={{ color: "var(--foreground)" }}
              >
                {me.name || me.username}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isAdmin && (
                  <Shield className="size-3" style={{ color: "#0ea5e9" }} />
                )}
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: isAdmin ? "#0ea5e9" : "#64748b" }}
                >
                  {me.role}
                </span>
              </div>
              <p
                className="text-[11px] truncate mt-0.5"
                style={{ color: "var(--muted-foreground)" }}
              >
                @{me.username}
              </p>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {isAdmin && (
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                style={{ color: "var(--foreground)" }}
              >
                <Settings className="size-4" style={{ color: "var(--muted-foreground)" }} />
                <span className="flex-1">Pengaturan</span>
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style={{
                    background: "rgba(14,165,233,0.12)",
                    color: "#0ea5e9",
                  }}
                >
                  Admin
                </span>
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-red-500/10"
              style={{ color: "#ef4444" }}
            >
              <LogOut className="size-4" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
