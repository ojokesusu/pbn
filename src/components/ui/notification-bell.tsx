"use client"

import { useEffect, useState, useCallback } from "react"
import { Bell, CheckCircle2, XCircle, AlertTriangle, Info, Link2, Rocket, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"

type Notification = {
  id: string
  type: string
  title: string
  message: string
  link: string
  severity: "info" | "success" | "warning" | "error"
  isRead: boolean
  createdAt: string
}

const SEVERITY_COLOR: Record<string, string> = {
  info: "#0ea5e9",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return "baru saja"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m lalu`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}j lalu`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}h lalu`
  return new Date(iso).toLocaleDateString("id-ID")
}

function iconFor(type: string, severity: string) {
  const color = SEVERITY_COLOR[severity] || "#64748b"
  const cls = "size-4 shrink-0"
  if (type.startsWith("deploy-success")) return <Rocket className={cls} style={{ color }} />
  if (type.startsWith("deploy-failed")) return <XCircle className={cls} style={{ color }} />
  if (type === "backlink-placed") return <Link2 className={cls} style={{ color }} />
  if (type === "milestone") return <CheckCircle2 className={cls} style={{ color }} />
  if (type === "health-alert") return <AlertTriangle className={cls} style={{ color }} />
  return <Info className={cls} style={{ color }} />
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications")
      if (!res.ok) return
      const data = await res.json()
      setItems(data.notifications || [])
      setUnread(data.unreadCount || 0)
    } catch {}
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30_000) // poll every 30s
    return () => clearInterval(interval)
  }, [load])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest("[data-notif-panel]")) setOpen(false)
    }
    document.addEventListener("click", handler)
    return () => document.removeEventListener("click", handler)
  }, [open])

  async function markAllRead() {
    await fetch("/api/notifications", { method: "POST" })
    load()
  }

  async function clearRead() {
    await fetch("/api/notifications", { method: "DELETE" })
    load()
  }

  async function onClickItem(n: Notification) {
    if (!n.isRead) {
      await fetch(`/api/notifications/${n.id}`, { method: "PATCH" })
    }
    setOpen(false)
    if (n.link) router.push(n.link)
    load()
  }

  return (
    <div className="relative" data-notif-panel>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        title="Notifikasi"
      >
        <Bell className="size-[18px]" style={{ color: "var(--muted-foreground)" }} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{
              background: "#ef4444",
              boxShadow: "0 0 0 2px var(--card)",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border shadow-2xl z-50"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <div
            className="px-4 py-3 border-b flex items-center justify-between"
            style={{ borderColor: "var(--border)" }}
          >
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Notifikasi
              </h3>
              <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                {unread > 0 ? `${unread} belum dibaca` : "Semua sudah dibaca"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] px-2 py-1 rounded hover:bg-black/5"
                  style={{ color: "#0ea5e9" }}
                >
                  Tandai semua
                </button>
              )}
              <button
                onClick={clearRead}
                className="p-1 rounded hover:bg-black/5"
                style={{ color: "var(--muted-foreground)" }}
                title="Hapus yang sudah dibaca"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[460px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
                Belum ada notifikasi.
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onClickItem(n)}
                  className="w-full text-left px-4 py-3 border-b transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
                  style={{
                    borderColor: "var(--border)",
                    background: n.isRead ? "transparent" : "rgba(14,165,233,0.05)",
                  }}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="pt-0.5">{iconFor(n.type, n.severity)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className="text-xs font-semibold truncate"
                          style={{ color: "var(--foreground)" }}
                        >
                          {n.title}
                        </p>
                        {!n.isRead && (
                          <span
                            className="shrink-0 size-1.5 rounded-full mt-1"
                            style={{ background: SEVERITY_COLOR[n.severity] || "#0ea5e9" }}
                          />
                        )}
                      </div>
                      {n.message && (
                        <p
                          className="text-[11px] mt-0.5 line-clamp-2"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {n.message}
                        </p>
                      )}
                      <p
                        className="text-[10px] mt-1"
                        style={{ color: "var(--muted-foreground)", opacity: 0.7 }}
                      >
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
