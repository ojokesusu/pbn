"use client"

import { useEffect, useState } from "react"
import { Plus, Loader2, Palette, Trash2, Globe, Sparkles, Search, ChevronLeft, ChevronRight } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { useConfirm } from "@/components/ui/confirm-modal"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GENRE_OPTIONS } from "@/lib/theme-engine"

interface Theme {
  id: string
  name: string
  templateName: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  bgColor: string
  textColor: string
  fontFamily: string
  headerStyle: string
  footerStyle: string
  customCss: string
  isGenerated?: boolean
  layoutName?: string
  createdAt: string
  _count?: { domains: number }
}

const TEMPLATE_OPTIONS = [
  { value: "developer", label: "Blog Developer", desc: "Dua kolom dengan sidebar" },
  { value: "flavor", label: "Majalah", desc: "Banner hero + grid 3 kolom" },
  { value: "flavor-developer", label: "Penulis Minimalis", desc: "Layout daftar bersih" },
  { value: "flavor-developer-developer", label: "Blog Klasik", desc: "Satu kolom tradisional" },
  { value: "developer-developer", label: "Portal Berita", desc: "Situs berita dengan sidebar" },
]

const FONT_OPTIONS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Merriweather",
  "Playfair Display",
]

const defaultForm = {
  name: "",
  templateName: "developer",
  primaryColor: "#2563eb",
  secondaryColor: "#1e40af",
  accentColor: "#f59e0b",
  bgColor: "var(--card)",
  textColor: "#111827",
  fontFamily: "Inter",
  headerStyle: "centered",
  footerStyle: "simple",
}

export default function ThemesPage() {
  const confirm = useConfirm()
  const [themes, setThemes] = useState<Theme[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selectedGenre, setSelectedGenre] = useState("__all__")
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...defaultForm })
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const perPage = 24

  const filtered = themes.filter((t) => {
    if (!search) return true
    const q = search.toLowerCase()
    return t.name.toLowerCase().includes(q) || t.fontFamily.toLowerCase().includes(q) || t.layoutName?.toLowerCase().includes(q) || t.templateName.toLowerCase().includes(q)
  })
  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage)

  useEffect(() => {
    fetchThemes()
  }, [])

  async function fetchThemes() {
    try {
      const res = await fetch("/api/themes")
      if (res.ok) {
        const data = await res.json()
        setThemes(data)
      }
    } catch (error) {
      console.error("Failed to fetch themes:", error)
    } finally {
      setLoading(false)
    }
  }

  function updateField(field: string, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value ?? "" }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) return

    setSaving(true)
    try {
      const res = await fetch("/api/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const newTheme = await res.json()
        setThemes((prev) => [newTheme, ...prev])
        setForm({ ...defaultForm })
        setShowForm(false)
      } else {
        const data = await res.json()
        alert(data.error || "Failed to create theme")
      }
    } catch (error) {
      console.error("Failed to create theme:", error)
      alert("Failed to create theme")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({ title: "Hapus Tema", message: "Apakah Anda yakin ingin menghapus tema ini?", variant: "danger", confirmText: "Hapus" })
    if (!ok) return
    try {
      const res = await fetch(`/api/themes/${id}`, { method: "DELETE" })
      if (res.ok) {
        setThemes((prev) => prev.filter((t) => t.id !== id))
      }
    } catch (error) {
      console.error("Failed to delete theme:", error)
    }
  }

  async function handleAutoGenerate() {
    setGenerating(true)
    try {
      const res = await fetch("/api/themes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: Date.now(), genre: selectedGenre !== "__all__" ? selectedGenre : undefined }),
      })
      if (res.ok) {
        const newTheme = await res.json()
        setThemes((prev) => [newTheme, ...prev])
      } else {
        const data = await res.json()
        alert(data.error || "Failed to generate theme")
      }
    } catch (error) {
      console.error("Failed to auto-generate theme:", error)
      alert("Failed to auto-generate theme")
    } finally {
      setGenerating(false)
    }
  }

  async function handleBulkGenerate(count: number) {
    setGenerating(true)
    try {
      const results: Theme[] = []
      for (let i = 0; i < count; i++) {
        const res = await fetch("/api/themes/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seed: Date.now() + i, genre: selectedGenre !== "__all__" ? selectedGenre : undefined }),
        })
        if (res.ok) {
          const newTheme = await res.json()
          results.push(newTheme)
        }
      }
      setThemes((prev) => [...results.reverse(), ...prev])
    } catch (error) {
      console.error("Failed to bulk generate themes:", error)
      alert("Failed to bulk generate themes")
    } finally {
      setGenerating(false)
    }
  }

  function ColorSwatch({
    color,
    label,
  }: {
    color: string
    label: string
  }) {
    return (
      <div className="flex items-center gap-2">
        <div
          className="size-5 rounded-md ring-1 ring-[#e2e8f0] shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs text-[color:var(--muted-foreground)]">{label}</span>
      </div>
    )
  }

  return (
    <SidebarInset>
      <AppHeader title="Tema" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-extrabold tracking-tight text-[color:var(--foreground)]">Tema</h2>
            <Badge className="bg-[#0ea5e9]/15 text-[#0ea5e9] border-transparent hover:bg-[#0ea5e9]/20">{themes.length}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedGenre} onValueChange={(v) => setSelectedGenre(v ?? "__all__")}>
              <SelectTrigger className="w-[180px] bg-[color:var(--muted)] border-[color:var(--border)] text-[color:var(--secondary-foreground)]">
                <SelectValue placeholder="Semua Genre" />
              </SelectTrigger>
              <SelectContent className="bg-[color:var(--muted)] border-[color:var(--border)]">
                <SelectItem value="__all__">Semua Genre</SelectItem>
                {GENRE_OPTIONS.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => handleBulkGenerate(10)} disabled={generating} className="bg-[color:var(--muted)] border-[color:var(--border)] hover:border-[#0ea5e9]/30 text-[color:var(--secondary-foreground)]">
              {generating ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Sparkles className="size-4 mr-1" />}
              Generate 10 Tema
            </Button>
            <Button variant="outline" onClick={handleAutoGenerate} disabled={generating} className="bg-[color:var(--muted)] border-[color:var(--border)] hover:border-[#0ea5e9]/30 text-[color:var(--secondary-foreground)]">
              {generating ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Sparkles className="size-4 mr-1" />}
              Generate Otomatis
            </Button>
            <Button onClick={() => setShowForm(!showForm)} className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white">
              <Plus className="size-4 mr-1" />
              Buat Tema
            </Button>
          </div>
        </div>

        {showForm && (
          <Card className="mb-6 bg-white border-[color:var(--border)] rounded-xl">
            <CardHeader>
              <CardTitle className="text-[color:var(--foreground)]">Tema Baru</CardTitle>
              <CardDescription className="text-[color:var(--muted-foreground)]">
                Konfigurasi tampilan visual untuk situs Anda
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-[color:var(--secondary-foreground)]">Nama Tema *</Label>
                  <Input
                    id="name"
                    placeholder="cth. Biru Bersih"
                    value={form.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    required
                    className="bg-white border-[color:var(--border)] text-[color:var(--secondary-foreground)]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="templateName" className="text-[color:var(--secondary-foreground)]">Template Layout</Label>
                  <Select
                    value={form.templateName}
                    onValueChange={(val) => updateField("templateName", val)}
                  >
                    <SelectTrigger className="w-full bg-white border-[color:var(--border)] text-[color:var(--secondary-foreground)]">
                      <SelectValue placeholder="Pilih template" />
                    </SelectTrigger>
                    <SelectContent className="bg-[color:var(--muted)] border-[color:var(--border)]">
                      {TEMPLATE_OPTIONS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label} — {t.desc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  <div className="space-y-2">
                    <Label htmlFor="primaryColor" className="text-[color:var(--secondary-foreground)]">Warna Utama</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="primaryColor"
                        value={form.primaryColor}
                        onChange={(e) =>
                          updateField("primaryColor", e.target.value)
                        }
                        className="h-8 w-10 cursor-pointer rounded border border-[color:var(--border)] bg-white p-0.5"
                      />
                      <Input
                        value={form.primaryColor}
                        onChange={(e) =>
                          updateField("primaryColor", e.target.value)
                        }
                        className="flex-1 bg-white border-[color:var(--border)] text-[color:var(--secondary-foreground)]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="secondaryColor" className="text-[color:var(--secondary-foreground)]">Warna Sekunder</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="secondaryColor"
                        value={form.secondaryColor}
                        onChange={(e) =>
                          updateField("secondaryColor", e.target.value)
                        }
                        className="h-8 w-10 cursor-pointer rounded border border-[color:var(--border)] bg-white p-0.5"
                      />
                      <Input
                        value={form.secondaryColor}
                        onChange={(e) =>
                          updateField("secondaryColor", e.target.value)
                        }
                        className="flex-1 bg-white border-[color:var(--border)] text-[color:var(--secondary-foreground)]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accentColor" className="text-[color:var(--secondary-foreground)]">Warna Aksen</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="accentColor"
                        value={form.accentColor}
                        onChange={(e) =>
                          updateField("accentColor", e.target.value)
                        }
                        className="h-8 w-10 cursor-pointer rounded border border-[color:var(--border)] bg-white p-0.5"
                      />
                      <Input
                        value={form.accentColor}
                        onChange={(e) =>
                          updateField("accentColor", e.target.value)
                        }
                        className="flex-1 bg-white border-[color:var(--border)] text-[color:var(--secondary-foreground)]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bgColor" className="text-[color:var(--secondary-foreground)]">Warna Latar</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="bgColor"
                        value={form.bgColor}
                        onChange={(e) =>
                          updateField("bgColor", e.target.value)
                        }
                        className="h-8 w-10 cursor-pointer rounded border border-[color:var(--border)] bg-white p-0.5"
                      />
                      <Input
                        value={form.bgColor}
                        onChange={(e) =>
                          updateField("bgColor", e.target.value)
                        }
                        className="flex-1 bg-white border-[color:var(--border)] text-[color:var(--secondary-foreground)]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="textColor" className="text-[color:var(--secondary-foreground)]">Warna Teks</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        id="textColor"
                        value={form.textColor}
                        onChange={(e) =>
                          updateField("textColor", e.target.value)
                        }
                        className="h-8 w-10 cursor-pointer rounded border border-[color:var(--border)] bg-white p-0.5"
                      />
                      <Input
                        value={form.textColor}
                        onChange={(e) =>
                          updateField("textColor", e.target.value)
                        }
                        className="flex-1 bg-white border-[color:var(--border)] text-[color:var(--secondary-foreground)]"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="fontFamily" className="text-[color:var(--secondary-foreground)]">Jenis Font</Label>
                    <Select
                      value={form.fontFamily}
                      onValueChange={(val) => updateField("fontFamily", val)}
                    >
                      <SelectTrigger className="w-full bg-white border-[color:var(--border)] text-[color:var(--secondary-foreground)]">
                        <SelectValue placeholder="Pilih font" />
                      </SelectTrigger>
                      <SelectContent className="bg-[color:var(--muted)] border-[color:var(--border)]">
                        {FONT_OPTIONS.map((font) => (
                          <SelectItem key={font} value={font}>
                            {font}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="headerStyle" className="text-[color:var(--secondary-foreground)]">Gaya Header</Label>
                    <Select
                      value={form.headerStyle}
                      onValueChange={(val) =>
                        updateField("headerStyle", val)
                      }
                    >
                      <SelectTrigger className="w-full bg-white border-[color:var(--border)] text-[color:var(--secondary-foreground)]">
                        <SelectValue placeholder="Pilih gaya" />
                      </SelectTrigger>
                      <SelectContent className="bg-[color:var(--muted)] border-[color:var(--border)]">
                        <SelectItem value="centered">Tengah</SelectItem>
                        <SelectItem value="left-aligned">
                          Rata Kiri
                        </SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                        <SelectItem value="full-width">Lebar Penuh</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="footerStyle" className="text-[color:var(--secondary-foreground)]">Gaya Footer</Label>
                    <Select
                      value={form.footerStyle}
                      onValueChange={(val) =>
                        updateField("footerStyle", val)
                      }
                    >
                      <SelectTrigger className="w-full bg-white border-[color:var(--border)] text-[color:var(--secondary-foreground)]">
                        <SelectValue placeholder="Pilih gaya" />
                      </SelectTrigger>
                      <SelectContent className="bg-[color:var(--muted)] border-[color:var(--border)]">
                        <SelectItem value="simple">Sederhana</SelectItem>
                        <SelectItem value="detailed">Detail</SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                        <SelectItem value="multi-column">
                          Multi Kolom
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      setShowForm(false)
                      setForm({ ...defaultForm })
                    }}
                    className="bg-[color:var(--muted)] border-[color:var(--border)] hover:border-[#0ea5e9]/30 text-[color:var(--secondary-foreground)]"
                  >
                    Batal
                  </Button>
                  <Button type="submit" disabled={saving} className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white">
                    {saving ? (
                      <Loader2 className="size-4 mr-1 animate-spin" />
                    ) : (
                      <Plus className="size-4 mr-1" />
                    )}
                    Buat Tema
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="bg-white border-[color:var(--border)] rounded-xl">
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24 mt-1" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : themes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Palette className="size-12 text-[#0ea5e9]/20 mb-4" />
            <h3 className="text-lg font-semibold text-[color:var(--foreground)]">Belum ada tema</h3>
            <p className="text-[color:var(--muted-foreground)] mt-1 mb-4">
              Buat tema pertama Anda untuk menata situs Anda
            </p>
            <Button onClick={() => setShowForm(true)} className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white">
              <Plus className="size-4 mr-1" />
              Buat Tema
            </Button>
          </div>
        ) : (
          <>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4" style={{ color: "var(--muted-foreground)" }} />
              <Input
                placeholder="Cari tema, layout, font..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1) }}
                className="pl-10 rounded-lg"
                style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
              />
            </div>
            {search && (
              <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
                {filtered.length} hasil ditemukan
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginated.map((theme) => (
              <Card key={theme.id} className="bg-white border-[color:var(--border)] rounded-xl hover:shadow-lg hover:shadow-[#0ea5e9]/10 transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-[color:var(--foreground)]">{theme.name}</CardTitle>
                      <CardDescription className="mt-1 text-[color:var(--muted-foreground)]">
                        {theme.isGenerated ? (
                          <><Badge className="mr-1 text-[10px] px-1 py-0 bg-[#0ea5e9]/15 text-[#0ea5e9] border-transparent">Auto</Badge>{theme.layoutName || theme.templateName}</>
                        ) : (
                          TEMPLATE_OPTIONS.find(t => t.value === theme.templateName)?.label || theme.templateName
                        )} · {theme.fontFamily}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(theme.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2.5">
                    <div className="flex gap-1.5">
                      {[
                        theme.primaryColor,
                        theme.secondaryColor,
                        theme.accentColor,
                        theme.bgColor,
                        theme.textColor,
                      ].map((color, i) => (
                        <div
                          key={i}
                          className="size-7 rounded-md ring-1 ring-[#e2e8f0]"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <ColorSwatch
                        color={theme.primaryColor}
                        label="Utama"
                      />
                      <ColorSwatch
                        color={theme.secondaryColor}
                        label="Sekunder"
                      />
                      <ColorSwatch
                        color={theme.accentColor}
                        label="Aksen"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-[color:var(--border)]">
                      <Globe className="size-3.5 text-[color:var(--muted-foreground)]" />
                      <span className="text-xs text-[color:var(--muted-foreground)]">
                        {theme._count?.domains ?? 0} domain
                      </span>
                      <span className="text-xs text-[color:var(--muted-foreground)] ml-auto">
                        {theme.headerStyle} / {theme.footerStyle}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Menampilkan {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} dari {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                  <ChevronLeft className="size-4" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let page: number
                  if (totalPages <= 7) { page = i + 1 }
                  else if (currentPage <= 4) { page = i + 1 }
                  else if (currentPage >= totalPages - 3) { page = totalPages - 6 + i }
                  else { page = currentPage - 3 + i }
                  return (
                    <Button key={page} variant={currentPage === page ? "default" : "outline"} size="sm" onClick={() => setCurrentPage(page)} className={`h-8 w-8 p-0 ${currentPage === page ? "bg-[#0ea5e9] text-white hover:bg-[#0284c7]" : ""}`} style={currentPage !== page ? { borderColor: "var(--border)", color: "var(--secondary-foreground)" } : {}}>
                      {page}
                    </Button>
                  )
                })}
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="h-8 w-8 p-0" style={{ borderColor: "var(--border)" }}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
        )}
      </div>
    </SidebarInset>
  )
}
