"use client"

import { useEffect, useState } from "react"
import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useMe } from "@/hooks/use-me"
import { useRouter } from "next/navigation"
import { useConfirm } from "@/components/ui/confirm-modal"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Shield, UserPlus, Trash2, Users, DollarSign, TrendingUp, Zap, Eye, EyeOff, Check, X } from "lucide-react"

type UserRow = {
  id: string
  username: string
  name: string
  role: "admin" | "operator"
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

type UsageStats = {
  today: { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number }
  thisMonth: { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number }
  lastMonth: { calls: number; costUsd: number }
  allTime: { calls: number; costUsd: number; totalTokens: number }
  daily: Array<{ date: string; cost: number; calls: number }>
  perOperation: Array<{ operation: string; calls: number; costUsd: number; totalTokens: number }>
  recent: Array<{
    id: string
    model: string
    operation: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd: number
    createdAt: string
  }>
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n)
}

export default function SettingsPage() {
  const router = useRouter()
  const { me, loading } = useMe()
  const confirm = useConfirm()
  const [users, setUsers] = useState<UserRow[]>([])
  const [tab, setTab] = useState<"users" | "cost">("users")
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)

  // New user form
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [newName, setNewName] = useState("")
  const [newRole, setNewRole] = useState<"admin" | "operator">("operator")
  const [creating, setCreating] = useState(false)
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword

  useEffect(() => {
    if (loading) return
    if (!me || me.role !== "admin") {
      router.replace("/")
      return
    }
    loadUsers()
  }, [loading, me, router])

  useEffect(() => {
    if (tab !== "cost" || !me || me.role !== "admin") return
    setUsageLoading(true)
    fetch("/api/api-usage")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setUsage(data))
      .finally(() => setUsageLoading(false))
  }, [tab, me])

  async function loadUsers() {
    const res = await fetch("/api/auth/users")
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      alert("Password dan konfirmasi tidak cocok")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          name: newName,
          role: newRole,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Gagal membuat user")
        return
      }
      alert(`User ${data.user.username} berhasil dibuat`)
      setNewUsername("")
      setNewPassword("")
      setConfirmPassword("")
      setShowNewPassword(false)
      setNewName("")
      setNewRole("operator")
      loadUsers()
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(user: UserRow) {
    const isSelf = me?.id === user.id
    const ok = await confirm({
      title: isSelf ? "⚠️ Hapus akun KAMU SENDIRI?" : "Hapus user?",
      message: isSelf
        ? `Ini akun kamu sendiri ("${user.username}")!\n\nKalau dihapus:\n• Kamu auto-logout\n• Kamu nggak bisa login lagi\n• Data login history hilang\n\nLebih baik nonaktifkan dulu (toggle status), jangan hapus.`
        : `User "${user.username}" (${user.name || "-"}) akan dihapus permanen.\n\n• Semua session login dia akan invalid\n• Log aktivitas dia tetap tersimpan\n• Tindakan ini TIDAK BISA di-undo`,
      confirmText: isSelf ? "Ya, hapus akun saya" : "Hapus user",
      variant: "danger",
    })
    if (!ok) return

    // Double-confirm for self-deletion
    if (isSelf) {
      const reallyOk = await confirm({
        title: "Beneran yakin?",
        message: `Satu klik lagi dan akun "${user.username}" akan HILANG SELAMANYA. Nggak ada cara balikin.`,
        confirmText: "Ya, saya paham, hapus",
        variant: "danger",
      })
      if (!reallyOk) return
    }

    const res = await fetch(`/api/auth/users/${user.id}`, { method: "DELETE" })
    if (res.ok) {
      if (isSelf) {
        await fetch("/api/auth/logout", { method: "POST" })
        router.push("/login")
        return
      }
      await confirm({ title: "✓ Berhasil", message: "User dihapus.", confirmText: "OK" })
      loadUsers()
    } else {
      const data = await res.json().catch(() => ({}))
      await confirm({ title: "✗ Gagal", message: data.error || "Gagal menghapus user", confirmText: "OK" })
    }
  }

  async function handleToggleActive(user: UserRow) {
    const res = await fetch(`/api/auth/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !user.isActive }),
    })
    if (res.ok) {
      alert(user.isActive ? "User dinonaktifkan" : "User diaktifkan")
      loadUsers()
    }
  }

  if (loading || !me || me.role !== "admin") {
    return null
  }

  return (
    <SidebarInset>
      <AppHeader title="Pengaturan" />
      <div className="flex-1 space-y-6 p-4 md:p-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => setTab("users")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "users"
                ? "border-teal-500 text-teal-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Users className="inline size-4 mr-1.5 -mt-0.5" />
            Manajemen User
          </button>
          <button
            onClick={() => setTab("cost")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "cost"
                ? "border-teal-500 text-teal-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <DollarSign className="inline size-4 mr-1.5 -mt-0.5" />
            API Cost Tracker
          </button>
        </div>

        {tab === "users" && (
          <>
            {/* Create new user */}
            <div
              className="rounded-xl border bg-white p-5"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="mb-4 flex items-center gap-2">
                <UserPlus className="size-5 text-teal-600" />
                <h2 className="text-base font-semibold">Tambah User Baru</h2>
              </div>
              <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-5">
                <div className="space-y-1">
                  <Label htmlFor="u-username">Username</Label>
                  <Input
                    id="u-username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="budi"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="u-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="u-password"
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="min 12 karakter"
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      tabIndex={-1}
                      aria-label={showNewPassword ? "Sembunyikan password" : "Tampilkan password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                    >
                      {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Min 12 karakter, harus ada huruf besar, huruf kecil, angka, dan simbol.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="u-password-confirm">Konfirmasi Password</Label>
                  <div className="relative">
                    <Input
                      id="u-password-confirm"
                      type={showNewPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="ulangi password di atas"
                      className="pr-10"
                      required
                    />
                    {confirmPassword.length > 0 && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        {passwordsMatch ? (
                          <Check className="size-4" style={{ color: "#10b981" }} />
                        ) : (
                          <X className="size-4" style={{ color: "#ef4444" }} />
                        )}
                      </span>
                    )}
                  </div>
                  {passwordsMismatch && (
                    <p className="text-[11px]" style={{ color: "#ef4444" }}>
                      Password tidak cocok dengan yang di atas
                    </p>
                  )}
                  {passwordsMatch && (
                    <p className="text-[11px]" style={{ color: "#10b981" }}>
                      ✓ Password cocok
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="u-name">Nama Lengkap</Label>
                  <Input
                    id="u-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Budi Santoso"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select
                    value={newRole}
                    onValueChange={(v) => setNewRole(v as "admin" | "operator")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operator">Operator</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={creating} className="w-full">
                    {creating ? "Membuat..." : "Tambah"}
                  </Button>
                </div>
              </form>
              <div
                className="mt-3 rounded-lg border px-3 py-2 text-xs"
                style={{ background: "rgba(14,165,233,0.1)", borderColor: "#bae6fd", color: "#0369a1" }}
              >
                <b>Admin</b>: bisa akses semua termasuk Pengaturan &amp; cost tracker ·{" "}
                <b>Operator</b>: tidak bisa lihat Pengaturan
              </div>
            </div>

            {/* User list */}
            <div
              className="rounded-xl border bg-white overflow-hidden"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-base font-semibold">
                  Daftar User ({users.length})
                </h2>
              </div>
              <table className="w-full text-sm">
                <thead style={{ background: "var(--background)" }}>
                  <tr className="text-left">
                    <th className="px-4 py-2 font-medium text-slate-600">Username</th>
                    <th className="px-4 py-2 font-medium text-slate-600">Nama</th>
                    <th className="px-4 py-2 font-medium text-slate-600">Role</th>
                    <th className="px-4 py-2 font-medium text-slate-600">Status</th>
                    <th className="px-4 py-2 font-medium text-slate-600">Login Terakhir</th>
                    <th className="px-4 py-2 font-medium text-slate-600 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-t"
                      style={{ borderColor: "var(--muted)" }}
                    >
                      <td className="px-4 py-3 font-medium">{u.username}</td>
                      <td className="px-4 py-3 text-slate-600">{u.name || "-"}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={
                            u.role === "admin"
                              ? { background: "rgba(14,165,233,0.15)", color: "#0369a1" }
                              : { background: "var(--muted)", color: "var(--secondary-foreground)" }
                          }
                        >
                          {u.role === "admin" && <Shield className="size-3" />}
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={u.id === me.id}
                          className="rounded-full px-2 py-0.5 text-xs font-medium disabled:opacity-50"
                          style={
                            u.isActive
                              ? { background: "rgba(16,185,129,0.15)", color: "#166534" }
                              : { background: "rgba(239,68,68,0.15)", color: "#991b1b" }
                          }
                        >
                          {u.isActive ? "Aktif" : "Nonaktif"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleString("id-ID")
                          : "Belum pernah"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(u)}
                          disabled={u.id === me.id}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "cost" && (
          <div className="space-y-4">
            {/* Confidentiality notice */}
            <div
              className="rounded-lg border px-3 py-2 text-xs flex items-start gap-2"
              style={{ background: "rgba(14,165,233,0.08)", borderColor: "rgba(14,165,233,0.25)" }}
            >
              <Shield className="size-4 shrink-0 mt-0.5" style={{ color: "#0ea5e9" }} />
              <div>
                <b style={{ color: "#0369a1" }}>Admin Only — Credential</b>
                <div style={{ color: "var(--muted-foreground)" }}>
                  Halaman ini hanya terlihat oleh admin. Operator tidak dapat melihat biaya API.
                </div>
              </div>
            </div>

            {usageLoading && (
              <div className="rounded-xl border bg-white p-8 text-center" style={{ borderColor: "var(--border)" }}>
                <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Memuat data...</p>
              </div>
            )}

            {!usageLoading && usage && (
              <>
                {/* Top 4 KPI cards */}
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="size-4" style={{ color: "#f59e0b" }} />
                      <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--muted-foreground)" }}>Hari Ini</span>
                    </div>
                    <p className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>{fmtUsd(usage.today.costUsd)}</p>
                    <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{usage.today.calls} calls · {fmtNum(usage.today.totalTokens)} tokens</p>
                  </div>

                  <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="size-4" style={{ color: "#10b981" }} />
                      <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--muted-foreground)" }}>Bulan Ini</span>
                    </div>
                    <p className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>{fmtUsd(usage.thisMonth.costUsd)}</p>
                    <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{usage.thisMonth.calls} calls · {fmtNum(usage.thisMonth.totalTokens)} tokens</p>
                  </div>

                  <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="size-4" style={{ color: "#64748b" }} />
                      <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--muted-foreground)" }}>Bulan Lalu</span>
                    </div>
                    <p className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>{fmtUsd(usage.lastMonth.costUsd)}</p>
                    <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{usage.lastMonth.calls} calls</p>
                  </div>

                  <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="size-4" style={{ color: "#a855f7" }} />
                      <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--muted-foreground)" }}>Total All-Time</span>
                    </div>
                    <p className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>{fmtUsd(usage.allTime.costUsd)}</p>
                    <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>{usage.allTime.calls} calls · {fmtNum(usage.allTime.totalTokens)} tokens</p>
                  </div>
                </div>

                {/* 30-day bar chart (CSS) */}
                <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
                  <h3 className="text-sm font-semibold mb-3">Biaya 30 Hari Terakhir</h3>
                  {(() => {
                    const maxCost = Math.max(...usage.daily.map((d) => d.cost), 0.0001)
                    return (
                      <div className="flex items-end gap-1 h-32">
                        {usage.daily.map((d) => {
                          const pct = (d.cost / maxCost) * 100
                          return (
                            <div
                              key={d.date}
                              className="flex-1 relative group"
                              title={`${d.date}: ${fmtUsd(d.cost)} (${d.calls} calls)`}
                            >
                              <div
                                className="w-full rounded-t transition-all"
                                style={{
                                  height: `${pct}%`,
                                  minHeight: d.cost > 0 ? "3px" : "0",
                                  background: d.cost > 0 ? "linear-gradient(180deg, #0ea5e9, #0284c7)" : "transparent",
                                }}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                  <div className="flex justify-between mt-2 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                    <span>{usage.daily[0]?.date}</span>
                    <span>Hari Ini</span>
                  </div>
                </div>

                {/* Per operation breakdown */}
                {usage.perOperation.length > 0 && (
                  <div className="rounded-xl border bg-white p-4" style={{ borderColor: "var(--border)" }}>
                    <h3 className="text-sm font-semibold mb-3">Biaya per Operasi (Bulan Ini)</h3>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                          <th className="pb-2">Operasi</th>
                          <th className="pb-2 text-right">Calls</th>
                          <th className="pb-2 text-right">Tokens</th>
                          <th className="pb-2 text-right">Biaya</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.perOperation.map((op) => (
                          <tr key={op.operation} className="border-t" style={{ borderColor: "var(--border)" }}>
                            <td className="py-2 font-medium">{op.operation || "—"}</td>
                            <td className="py-2 text-right">{op.calls}</td>
                            <td className="py-2 text-right text-xs">{fmtNum(op.totalTokens)}</td>
                            <td className="py-2 text-right font-semibold">{fmtUsd(op.costUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Recent calls */}
                <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)" }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                    <h3 className="text-sm font-semibold">50 Panggilan API Terakhir</h3>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0" style={{ background: "var(--background)" }}>
                        <tr className="text-left text-[10px] uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
                          <th className="px-4 py-2">Waktu</th>
                          <th className="px-4 py-2">Operasi</th>
                          <th className="px-4 py-2 text-right">In</th>
                          <th className="px-4 py-2 text-right">Out</th>
                          <th className="px-4 py-2 text-right">Biaya</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.recent.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
                              Belum ada panggilan API tercatat.
                            </td>
                          </tr>
                        )}
                        {usage.recent.map((r) => (
                          <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                            <td className="px-4 py-2 text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                              {new Date(r.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="px-4 py-2 text-xs">{r.operation || "—"}</td>
                            <td className="px-4 py-2 text-right text-[11px]" style={{ color: "var(--muted-foreground)" }}>{fmtNum(r.inputTokens)}</td>
                            <td className="px-4 py-2 text-right text-[11px]" style={{ color: "var(--muted-foreground)" }}>{fmtNum(r.outputTokens)}</td>
                            <td className="px-4 py-2 text-right font-semibold">{fmtUsd(r.costUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </SidebarInset>
  )
}
