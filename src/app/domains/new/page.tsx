"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Save, Globe, Info } from "lucide-react"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const GENRE_OPTIONS = [
  "Teknologi", "Kesehatan", "Keuangan", "Travel", "Kuliner", "Fashion",
  "Olahraga", "Pendidikan", "Berita", "Otomotif", "Properti", "Hiburan",
  "Bisnis", "Seni & Budaya", "Lingkungan", "Parenting", "Gaming",
  "Fotografi", "Musik", "Pertanian",
]

export default function NewDomainPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [servers, setServers] = useState<{ id: string; name: string; host: string }[]>([])

  const [form, setForm] = useState({
    name: "",
    url: "",
    status: "active",
    serverId: "",
    genre: "",
  })

  useEffect(() => {
    fetch("/api/servers")
      .then((r) => r.json())
      .then((data) => setServers(data))
      .catch((err) => console.error("Failed to fetch servers:", err))
  }, [])

  function updateField(field: string, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value ?? "" }))
    if (error) setError("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (!form.name.trim()) { setError("Nama domain wajib diisi."); return }
    if (!form.url.trim()) { setError("URL domain wajib diisi."); return }
    if (!form.genre) { setError("Genre wajib dipilih."); return }

    setSaving(true)
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          url: form.url.trim().startsWith("http") ? form.url.trim() : `https://${form.url.trim()}`,
          status: form.status,
          serverId: form.serverId || null,
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
              <div className="space-y-2">
                <Label style={{ color: "var(--secondary-foreground)" }}>Server (opsional)</Label>
                <Select value={form.serverId} onValueChange={(val) => updateField("serverId", val)}>
                  <SelectTrigger className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                    <SelectValue placeholder="Pilih server cPanel" />
                  </SelectTrigger>
                  <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                    {servers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.host})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Server tempat domain di-host. Bisa diatur nanti.</p>
              </div>
            </CardContent>
          </Card>

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
