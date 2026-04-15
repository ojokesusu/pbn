"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Save, Globe, Info, Server, Plus, Lock } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useMe } from "@/hooks/use-me"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type ServerMode = "none" | "existing" | "new"

const GENRE_OPTIONS = [
  "Teknologi", "Kesehatan", "Keuangan", "Travel", "Kuliner", "Fashion",
  "Olahraga", "Pendidikan", "Berita", "Otomotif", "Properti", "Hiburan",
  "Bisnis", "Seni & Budaya", "Lingkungan", "Parenting", "Gaming",
  "Fotografi", "Musik", "Pertanian", "iGaming",
]

export default function NewDomainPage() {
  const router = useRouter()
  const { me } = useMe()
  const isAdmin = me?.role === "admin"
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [servers, setServers] = useState<{ id: string; label: string; name: string; host: string }[]>([])
  const [serverMode, setServerMode] = useState<ServerMode>("none")

  const [form, setForm] = useState({
    name: "",
    url: "",
    status: "active",
    serverId: "",
    genre: "",
  })

  const [newServer, setNewServer] = useState({
    name: "",         // nameserver 1 (e.g. ns1.example.com)
    nameserver2: "",  // nameserver 2
    host: "",         // server IP
    username: "",     // FTP/cPanel user
    password: "",     // FTP/cPanel password
    port: "21",
  })

  useEffect(() => {
    if (!isAdmin) return
    fetch("/api/servers")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => Array.isArray(data) && setServers(data))
      .catch((err) => console.error("Failed to fetch servers:", err))
  }, [isAdmin])

  function updateField(field: string, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value ?? "" }))
    if (error) setError("")
  }

  function updateNewServer(field: keyof typeof newServer, value: string) {
    setNewServer((prev) => ({ ...prev, [field]: value }))
    if (error) setError("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!form.name.trim()) { setError("Nama domain wajib diisi."); return }
    if (!form.url.trim()) { setError("URL domain wajib diisi."); return }
    if (!form.genre) { setError("Genre wajib dipilih."); return }

    // Validate new server fields if user is creating one inline
    if (serverMode === "new") {
      if (!newServer.name.trim()) { setError("Nameserver 1 wajib diisi."); return }
      if (!newServer.host.trim()) { setError("IP server wajib diisi."); return }
      if (!newServer.username.trim()) { setError("Username cPanel wajib diisi."); return }
      if (!newServer.password.trim()) { setError("Password cPanel wajib diisi."); return }
    }

    setSaving(true)
    try {
      let resolvedServerId = form.serverId || null

      // If creating a new server inline, create it first and use the returned id
      if (serverMode === "new") {
        const srvRes = await fetch("/api/servers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newServer.name.trim(),
            nameserver2: newServer.nameserver2.trim(),
            host: newServer.host.trim(),
            username: newServer.username.trim(),
            password: newServer.password.trim(),
            port: parseInt(newServer.port, 10) || 21,
            status: "active",
          }),
        })
        if (!srvRes.ok) {
          const data = await srvRes.json()
          throw new Error(data.error || "Gagal membuat server")
        }
        const created = await srvRes.json()
        resolvedServerId = created.id
      }

      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          url: form.url.trim().startsWith("http") ? form.url.trim() : `https://${form.url.trim()}`,
          status: form.status,
          serverId: resolvedServerId,
          genre: form.genre,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Gagal membuat domain")
      }

      router.push("/domains")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat domain")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidebarInset>
      <AppHeader title="Tambah Domain" />
      <div className="flex-1 space-y-6 p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" className="rounded-lg" style={{ color: "var(--muted-foreground)" }} onClick={() => router.push("/domains")}>
            <ArrowLeft />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl" style={{ background: "rgba(14,165,233,0.1)" }}>
              <Globe className="size-5" style={{ color: "#0ea5e9" }} />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Tambah Domain</h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Daftarkan domain baru di jaringan PBN.</p>
            </div>
          </div>
        </div>

        {/* Info box */}
        <div className="rounded-xl border p-4 flex items-start gap-3" style={{ background: "rgba(14,165,233,0.1)", borderColor: "#bae6fd" }}>
          <Info className="size-5 shrink-0 mt-0.5" style={{ color: "#0369a1" }} />
          <div className="text-sm" style={{ color: "#0c4a6e" }}>
            <p className="font-medium mb-1">Tema akan di-generate otomatis</p>
            <p className="text-xs" style={{ color: "#0369a1" }}>
              Saat domain di-deploy pertama kali, sistem akan otomatis membuat tema unik berdasarkan genre
              (warna, font, layout berbeda). Tidak perlu pilih tema manual.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg border p-4 text-sm" style={{ background: "rgba(239,68,68,0.1)", borderColor: "#fecaca", color: "#dc2626" }}>
              {error}
            </div>
          )}

          <Card className="rounded-xl border shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <CardHeader>
              <CardTitle style={{ color: "var(--foreground)" }}>Informasi Domain</CardTitle>
              <CardDescription style={{ color: "var(--muted-foreground)" }}>Isi data domain yang akan didaftarkan.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label style={{ color: "var(--secondary-foreground)" }}>Nama Domain</Label>
                <Input
                  placeholder="contoh: Tech Corner"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className="rounded-lg"
                  style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  required
                />
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Nama tampilan situs (bukan URL)</p>
              </div>
              <div className="space-y-2">
                <Label style={{ color: "var(--secondary-foreground)" }}>URL Domain</Label>
                <Input
                  placeholder="contoh: techcorner.com"
                  value={form.url}
                  onChange={(e) => updateField("url", e.target.value)}
                  className="rounded-lg"
                  style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  required
                />
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>https:// akan ditambahkan otomatis jika belum ada</p>
              </div>
              <div className="space-y-2">
                <Label style={{ color: "var(--secondary-foreground)" }}>Genre / Niche *</Label>
                <Select value={form.genre} onValueChange={(val) => updateField("genre", val)}>
                  <SelectTrigger className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                    <SelectValue placeholder="Pilih genre" />
                  </SelectTrigger>
                  <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                    {GENRE_OPTIONS.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Menentukan template, warna, dan topik artikel AI</p>
              </div>
              {isAdmin ? (
                <div className="space-y-2">
                  <Label style={{ color: "var(--secondary-foreground)" }}>Server (opsional)</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setServerMode("none"); updateField("serverId", "") }}
                      className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all"
                      style={{
                        borderColor: serverMode === "none" ? "#0ea5e9" : "var(--border)",
                        background: serverMode === "none" ? "rgba(14,165,233,0.1)" : "transparent",
                        color: serverMode === "none" ? "#0ea5e9" : "var(--muted-foreground)",
                      }}
                    >
                      Nanti saja
                    </button>
                    <button
                      type="button"
                      onClick={() => setServerMode("existing")}
                      className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all"
                      style={{
                        borderColor: serverMode === "existing" ? "#0ea5e9" : "var(--border)",
                        background: serverMode === "existing" ? "rgba(14,165,233,0.1)" : "transparent",
                        color: serverMode === "existing" ? "#0ea5e9" : "var(--muted-foreground)",
                      }}
                    >
                      Pilih yang ada
                    </button>
                    <button
                      type="button"
                      onClick={() => { setServerMode("new"); updateField("serverId", "") }}
                      className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all inline-flex items-center justify-center gap-1"
                      style={{
                        borderColor: serverMode === "new" ? "#84cc16" : "var(--border)",
                        background: serverMode === "new" ? "rgba(132,204,22,0.1)" : "transparent",
                        color: serverMode === "new" ? "#65a30d" : "var(--muted-foreground)",
                      }}
                    >
                      <Plus className="size-3" /> Tambah baru
                    </button>
                  </div>

                  {serverMode === "existing" && (
                    <Select value={form.serverId} onValueChange={(val) => updateField("serverId", val)}>
                      <SelectTrigger className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                        <SelectValue placeholder="Pilih server cPanel" />
                      </SelectTrigger>
                      <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                        {servers.length === 0 ? (
                          <div className="px-2 py-6 text-center text-xs text-[color:var(--muted-foreground)]">
                            Belum ada server tersimpan. Pilih &quot;Tambah baru&quot;.
                          </div>
                        ) : (
                          servers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.label || "Server-???"} ({s.host})</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )}

                  {serverMode === "none" && (
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      Domain akan dibuat tanpa server. Bisa di-assign kapan saja dari menu Server.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label style={{ color: "var(--secondary-foreground)" }}>Server</Label>
                  <div className="rounded-lg border px-3 py-2 text-xs flex items-center gap-2" style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}>
                    <Lock className="size-3" />
                    Assignment server hanya bisa dilakukan oleh admin.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Inline "Add New Server" form (admin only) */}
          {isAdmin && serverMode === "new" && (
            <Card className="rounded-xl border shadow-sm" style={{ background: "var(--card)", borderColor: "rgba(132,204,22,0.3)" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" style={{ color: "var(--foreground)" }}>
                  <Server className="size-5" style={{ color: "#65a30d" }} />
                  Data Server Baru
                </CardTitle>
                <CardDescription style={{ color: "var(--muted-foreground)" }}>
                  Server baru akan dibuat otomatis dan langsung di-assign ke domain ini.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label style={{ color: "var(--secondary-foreground)" }}>Nameserver 1 *</Label>
                  <Input
                    placeholder="ns1.example.com"
                    value={newServer.name}
                    onChange={(e) => updateNewServer("name", e.target.value)}
                    className="rounded-lg font-mono text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  />
                </div>
                <div className="space-y-2">
                  <Label style={{ color: "var(--secondary-foreground)" }}>Nameserver 2</Label>
                  <Input
                    placeholder="ns2.example.com"
                    value={newServer.nameserver2}
                    onChange={(e) => updateNewServer("nameserver2", e.target.value)}
                    className="rounded-lg font-mono text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  />
                </div>
                <div className="space-y-2">
                  <Label style={{ color: "var(--secondary-foreground)" }}>IP Server / Host *</Label>
                  <Input
                    placeholder="contoh: 192.168.1.1"
                    value={newServer.host}
                    onChange={(e) => updateNewServer("host", e.target.value)}
                    className="rounded-lg font-mono text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  />
                </div>
                <div className="space-y-2">
                  <Label style={{ color: "var(--secondary-foreground)" }}>Port FTP</Label>
                  <Input
                    type="number"
                    placeholder="21"
                    value={newServer.port}
                    onChange={(e) => updateNewServer("port", e.target.value)}
                    className="rounded-lg"
                    style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  />
                </div>
                <div className="space-y-2">
                  <Label style={{ color: "var(--secondary-foreground)" }}>Username cPanel *</Label>
                  <Input
                    placeholder="username"
                    value={newServer.username}
                    onChange={(e) => updateNewServer("username", e.target.value)}
                    className="rounded-lg"
                    style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label style={{ color: "var(--secondary-foreground)" }}>Password cPanel *</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={newServer.password}
                    onChange={(e) => updateNewServer("password", e.target.value)}
                    className="rounded-lg"
                    style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                    autoComplete="new-password"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }} onClick={() => router.push("/domains")}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="rounded-lg shadow-lg"
              style={{ background: "#0ea5e9", color: "#ffffff", boxShadow: "0 4px 14px rgba(14,165,233,0.3)" }}
            >
              {saving ? (
                <><Loader2 className="size-4 mr-1 animate-spin" /> Menyimpan...</>
              ) : (
                <><Save className="size-4 mr-1" /> Buat Domain</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </SidebarInset>
  )
}
