"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Eye, EyeOff, Check, X as XIcon, UserCog, Loader2 } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useMe } from "@/hooks/use-me"
import { AvatarDisplay } from "@/components/ui/avatar-display"
import { AvatarPicker } from "@/components/ui/avatar-picker"
import { useConfirm } from "@/components/ui/confirm-modal"

export default function ProfilePage() {
  const router = useRouter()
  const confirm = useConfirm()
  const { me, loading } = useMe()

  const [name, setName] = useState("")
  const [avatarId, setAvatarId] = useState<string>("")
  const [showPicker, setShowPicker] = useState(false)

  const [newUsername, setNewUsername] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPasswords, setShowPasswords] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  useEffect(() => {
    if (loading) return
    if (!me) {
      router.replace("/login")
      return
    }
    setName(me.name || "")
    setAvatarId(me.avatarId || "")
    setNewUsername(me.username)
  }, [loading, me, router])

  const pwMatch = newPassword.length > 0 && newPassword === confirmPassword
  const pwMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const wantsSensitiveChange = !!newPassword || (me && newUsername && newUsername !== me.username)

  async function saveProfileOnly() {
    // Name + avatar only — no password required
    setSaving(true)
    setError("")
    setSuccess("")
    try {
      const res = await fetch("/api/auth/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, avatarId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Gagal simpan")
      setSuccess("Profil berhasil diperbarui")
      setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error")
    } finally {
      setSaving(false)
    }
  }

  async function saveSensitive(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (newPassword && newPassword !== confirmPassword) {
      setError("Password baru dan konfirmasi tidak cocok")
      return
    }
    if (!currentPassword) {
      setError("Password saat ini wajib diisi")
      return
    }

    const ok = await confirm({
      title: "Simpan perubahan?",
      message:
        (newUsername !== me?.username ? `• Username: ${me?.username} → ${newUsername}\n` : "") +
        (newPassword ? `• Password akan diganti (login ulang mungkin perlu)\n` : "") +
        `\nPastikan kamu inget credentials baru — simpan di tempat aman.`,
      confirmText: "Ya, simpan",
    })
    if (!ok) return

    setSaving(true)
    try {
      const body: Record<string, string> = { currentPassword }
      if (newUsername !== me?.username) body.newUsername = newUsername
      if (newPassword) body.newPassword = newPassword

      const res = await fetch("/api/auth/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Gagal simpan")

      setSuccess("Credentials berhasil diperbarui — login ulang kalau ada masalah")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error")
    } finally {
      setSaving(false)
    }
  }

  if (loading || !me) {
    return (
      <SidebarInset>
        <AppHeader title="Profil" />
        <div className="p-6" />
      </SidebarInset>
    )
  }

  return (
    <SidebarInset>
      <AppHeader title="Profil Saya" />
      <div className="flex-1 space-y-6 p-6 max-w-3xl" style={{ background: "var(--background)" }}>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft />
          </Button>
          <div>
            <h2 className="text-2xl font-extrabold" style={{ color: "var(--foreground)" }}>Profil Saya</h2>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Kelola nama, avatar, username, dan password akun kamu.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border p-3 text-sm" style={{ background: "rgba(239,68,68,0.1)", borderColor: "#fecaca", color: "#dc2626" }}>
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border p-3 text-sm" style={{ background: "rgba(16,185,129,0.1)", borderColor: "#a7f3d0", color: "#059669" }}>
            {success}
          </div>
        )}

        {/* Profile card — name + avatar (no password required) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="size-5" style={{ color: "#0ea5e9" }} />
              Tampilan Profil
            </CardTitle>
            <CardDescription>
              Info ini kelihatan di header dashboard dan di log aktivitas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <AvatarDisplay avatarId={avatarId} name={name || me.name} username={me.username} role={me.role} size="xl" />
              <div className="flex-1">
                <p className="font-semibold">{name || me.name || me.username}</p>
                <p className="text-xs text-muted-foreground">@{me.username} · {me.role}</p>
                <button
                  type="button"
                  onClick={() => setShowPicker((v) => !v)}
                  className="mt-2 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-muted"
                  style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                >
                  {showPicker ? "Tutup picker" : "🎨 Ganti avatar"}
                </button>
              </div>
            </div>

            {showPicker && (
              <div className="rounded-lg border p-4" style={{ background: "var(--muted)", borderColor: "var(--border)" }}>
                <AvatarPicker
                  value={avatarId}
                  onChange={setAvatarId}
                  onClose={() => setShowPicker(false)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="profile-name">Nama Lengkap</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama tampilan (misal: Shandi Firmansyah)"
              />
              <p className="text-[11px] text-muted-foreground">
                Ini nama yang muncul di dashboard, bukan username.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveProfileOnly} disabled={saving} className="rounded-lg">
                {saving ? <><Loader2 className="size-4 mr-1 animate-spin" /> Menyimpan...</> : <><Save className="size-4 mr-1" /> Simpan profil</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Credentials card — username + password (requires current password) */}
        <Card>
          <CardHeader>
            <CardTitle>🔐 Ganti Username / Password</CardTitle>
            <CardDescription>
              Butuh password saat ini untuk verifikasi. Kosongin field yang nggak mau diubah.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveSensitive} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cur-pw">Password saat ini *</Label>
                <div className="relative">
                  <Input
                    id="cur-pw"
                    type={showPasswords ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Password yang sekarang kamu pakai"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords((v) => !v)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
                  >
                    {showPasswords ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-username">Username baru</Label>
                <Input
                  id="new-username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Biarkan sama kalau nggak mau ganti"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-pw">Password baru</Label>
                <div className="relative">
                  <Input
                    id="new-pw"
                    type={showPasswords ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Kosongin kalau nggak mau ganti password"
                    className="pr-10"
                  />
                </div>
                {newPassword && (
                  <p className="text-[11px] text-muted-foreground">
                    Min 12 karakter, harus ada huruf besar, huruf kecil, angka, dan simbol.
                  </p>
                )}
              </div>

              {newPassword && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-pw">Konfirmasi password baru</Label>
                  <div className="relative">
                    <Input
                      id="confirm-pw"
                      type={showPasswords ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ulangi password baru"
                      className="pr-10"
                    />
                    {confirmPassword.length > 0 && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        {pwMatch ? <Check className="size-4" style={{ color: "#10b981" }} /> : <XIcon className="size-4" style={{ color: "#ef4444" }} />}
                      </span>
                    )}
                  </div>
                  {pwMismatch && <p className="text-[11px]" style={{ color: "#ef4444" }}>Tidak cocok</p>}
                  {pwMatch && <p className="text-[11px]" style={{ color: "#10b981" }}>✓ Cocok</p>}
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={saving || !wantsSensitiveChange} className="rounded-lg">
                  {saving ? <><Loader2 className="size-4 mr-1 animate-spin" /> Menyimpan...</> : <><Save className="size-4 mr-1" /> Simpan credentials</>}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  )
}
