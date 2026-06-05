"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Pencil,
  Rocket,
  Save,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useConfirm } from "@/components/ui/confirm-modal"
import { Zap } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { UrlLink } from "@/components/ui/url-link"

interface Article {
  id: string
  title: string
  slug: string
  status: string
  authorName: string
  publishedAt: string | null
  createdAt: string
}

interface DeployLog {
  id: string
  action: string
  status: string
  filesChanged: number
  message: string
  deployedAt: string
}

interface Theme {
  id: string
  name: string
}

const GENRE_OPTIONS = [
  "Teknologi",
  "Kesehatan",
  "Keuangan",
  "Travel",
  "Makanan",
  "Fashion",
  "Olahraga",
  "Pendidikan",
  "Berita",
  "Otomotif",
  "Properti",
  "Hiburan",
  "Bisnis",
  "Seni & Budaya",
  "Lifestyle",
  "iGaming",
]

interface Domain {
  id: string
  name: string
  url: string
  genre: string
  status: string
  themeId: string | null
  serverId: string | null
  server: { id: string; label?: string; name: string; nameserver2?: string; host: string } | null
  lastDeployed: string | null
  createdAt: string
  updatedAt: string
  theme: Theme | null
  articles: Article[]
  deployLogs?: DeployLog[]
  domainSchedule?: { isActive: boolean } | null
}

const statusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: "Aktif",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  },
  inactive: {
    label: "Nonaktif",
    className: "bg-red-500/15 text-red-400 border-red-500/25",
  },
  error: {
    label: "Error",
    className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  },
}

const articleStatusConfig: Record<string, { label: string; className: string }> = {
  draft: {
    label: "Draft",
    className: "bg-muted text-muted-foreground",
  },
  published: {
    label: "Terbit",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  },
}

const deployStatusConfig: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  success: { icon: CheckCircle2, className: "text-emerald-400" },
  failed: { icon: XCircle, className: "text-red-400" },
  "in-progress": { icon: Loader2, className: "text-yellow-400 animate-spin" },
}

export default function DomainDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const confirm = useConfirm()
  const [domain, setDomain] = useState<Domain | null>(null)
  const [themes, setThemes] = useState<Theme[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const [form, setForm] = useState({
    name: "",
    url: "",
    themeId: "",
    status: "active",
    serverId: "",
    genre: "",
  })
  const [servers, setServers] = useState<{id: string; name: string; host: string}[]>([])
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    fetchDomain()
    fetchOptions()
  }, [params.id])

  async function fetchDomain() {
    try {
      const res = await fetch(`/api/domains/${params.id}`)
      if (!res.ok) throw new Error("Domain not found")
      const data = await res.json()
      setDomain(data)
      setForm({
        name: data.name,
        url: data.url,
        themeId: data.themeId ?? "",
        status: data.status,
        serverId: data.serverId ?? "",
        genre: data.genre ?? "",
      })
    } catch (err) {
      console.error("Failed to fetch domain:", err)
      setError("Failed to load domain.")
    } finally {
      setLoading(false)
    }
  }

  async function fetchOptions() {
    try {
      const [themesData, serversData] = await Promise.all([
        fetch("/api/themes").then((r) => r.json()),
        fetch("/api/servers").then((r) => r.json()),
      ])
      setThemes(themesData)
      setServers(serversData)
    } catch (err) {
      console.error("Failed to fetch options:", err)
    }
  }

  function updateField(field: string, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value ?? "" }))
    if (error) setError("")
    if (success) setSuccess("")
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (!form.name.trim()) {
      setError("Nama domain wajib diisi.")
      return
    }
    if (!form.url.trim()) {
      setError("URL domain wajib diisi.")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/domains/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          url: form.url.trim(),
          themeId: form.themeId || null,
          status: form.status,
          serverId: form.serverId || null,
          genre: form.genre,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Failed to update domain")
      }

      const updated = await res.json()
      setDomain((prev) =>
        prev ? { ...prev, ...updated, articles: prev.articles } : prev
      )
      setEditing(false)
      setSuccess("Domain berhasil diperbarui.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update domain")
    } finally {
      setSaving(false)
    }
  }

  async function handleActivateScheduler() {
    if (!domain) return
    if (!domain.serverId) {
      await confirm({
        title: "Server belum di-assign",
        message: "Domain ini belum punya server. Edit dulu domain → pilih/tambah server, baru aktifkan scheduler.",
        confirmText: "OK",
      })
      return
    }
    const ok = await confirm({
      title: "Aktifkan domain di scheduler?",
      message:
        `Domain "${domain.name}" akan didaftarkan ke scheduler.\n\n` +
        `Sistem akan otomatis:\n` +
        `1. Generate 5 artikel backdated (kalau belum ada)\n` +
        `2. Deploy ke server\n` +
        `3. Purge Cloudflare cache + IndexNow\n` +
        `4. Sebar backlink dari pool\n\n` +
        `Pertama kali jalan dalam ~10 menit ke depan.`,
      confirmText: "Aktifkan & Live",
    })
    if (!ok) return

    setActivating(true)
    try {
      const res = await fetch("/api/scheduler/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", domainIds: [domain.id] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Gagal aktivasi")
      await confirm({
        title: "✓ Aktivasi berhasil",
        message: `${domain.name} udah aktif di scheduler. Cek lagi 10-20 menit lagi untuk lihat artikel + deploy pertamanya.`,
        confirmText: "OK",
      })
      await fetchDomain()
    } catch (err) {
      await confirm({
        title: "✗ Gagal",
        message: err instanceof Error ? err.message : "Unknown error",
        confirmText: "OK",
      })
    } finally {
      setActivating(false)
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Belum pernah"
    return new Date(dateStr).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <SidebarInset>
        <AppHeader title="Detail Domain" />
        <div className="flex-1 space-y-6 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </SidebarInset>
    )
  }

  if (!domain) {
    return (
      <SidebarInset>
        <AppHeader title="Domain Tidak Ditemukan" />
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <Globe className="size-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">Domain tidak ditemukan</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Domain yang Anda cari tidak tersedia.
          </p>
          <Button className="mt-4" onClick={() => router.push("/domains")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Kembali ke Domain
          </Button>
        </div>
      </SidebarInset>
    )
  }

  const domainStatus = statusConfig[domain.status] ?? statusConfig.inactive

  return (
    <SidebarInset>
      <AppHeader title={domain.name} />
      <div className="flex-1 space-y-6 p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => router.push("/domains")}
            >
              <ArrowLeft />
              <span className="sr-only">Kembali</span>
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold tracking-tight">
                  {domain.name}
                </h2>
                <Badge variant="outline" className={domainStatus.className}>
                  {domainStatus.label}
                </Badge>
              </div>
              <a
                href={domain.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                {domain.url}
                <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
          {!editing && (
            <div className="flex items-center gap-2">
              {!domain.domainSchedule?.isActive ? (
                <Button
                  onClick={handleActivateScheduler}
                  disabled={activating}
                  className="rounded-lg shadow-lg"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#ffffff" }}
                >
                  {activating ? (
                    <><Loader2 className="size-4 mr-1 animate-spin" /> Mengaktifkan...</>
                  ) : (
                    <><Zap className="size-4 mr-1" /> Aktifkan & Live</>
                  )}
                </Button>
              ) : (
                <Badge variant="outline" className="text-xs px-3 py-1.5" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", borderColor: "rgba(16,185,129,0.3)" }}>
                  ● Aktif di Scheduler
                </Badge>
              )}
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil data-icon="inline-start" />
                Edit Domain
              </Button>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription>Artikel</CardDescription>
              <FileText className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-3xl font-bold">
                {domain.articles.length}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {domain.articles.filter((a) => a.status === "published").length}{" "}
                terbit
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription>Tema</CardDescription>
              <Globe className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-xl font-bold">
                {domain.theme?.name ?? "Tidak ada"}
              </CardTitle>
              <p className="text-xs text-muted-foreground">Tema saat ini</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription>Terakhir Deploy</CardDescription>
              <Rocket className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-base font-bold">
                {formatDate(domain.lastDeployed)}
              </CardTitle>
              <p className="text-xs text-muted-foreground">Waktu deploy terakhir</p>
            </CardContent>
          </Card>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            {success}
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Ringkasan</TabsTrigger>
            <TabsTrigger value="articles">
              Artikel ({domain.articles.length})
            </TabsTrigger>
            <TabsTrigger value="deploy">Riwayat Deploy</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            {editing ? (
              <form onSubmit={handleSave} className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Informasi Domain</CardTitle>
                    <CardDescription>
                      Perbarui detail dasar domain ini.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nama Domain</Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="url">URL Domain</Label>
                      <Input
                        id="url"
                        value={form.url}
                        onChange={(e) => updateField("url", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="theme">Tema</Label>
                      <Select
                        value={form.themeId}
                        onValueChange={(val) =>
                          updateField("themeId", val as string)
                        }
                      >
                        <SelectTrigger id="theme" className="w-full">
                          <SelectValue placeholder="Pilih tema" />
                        </SelectTrigger>
                        <SelectContent>
                          {themes.map((theme) => (
                            <SelectItem key={theme.id} value={theme.id}>
                              {theme.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={form.status}
                        onValueChange={(val) =>
                          updateField("status", val as string)
                        }
                      >
                        <SelectTrigger id="status" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Aktif</SelectItem>
                          <SelectItem value="inactive">Nonaktif</SelectItem>
                          <SelectItem value="error">Error</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="server">Server</Label>
                      <Select value={form.serverId} onValueChange={(val) => updateField("serverId", val)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Pilih server" />
                        </SelectTrigger>
                        <SelectContent>
                          {servers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} ({s.host})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="genre">Genre / Niche</Label>
                      <Select value={form.genre} onValueChange={(val) => updateField("genre", val)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Pilih genre" />
                        </SelectTrigger>
                        <SelectContent>
                          {GENRE_OPTIONS.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditing(false)
                      if (domain) {
                        setForm({
                          name: domain.name,
                          url: domain.url,
                          themeId: domain.themeId ?? "",
                          status: domain.status,
                          serverId: domain.serverId ?? "",
                          genre: domain.genre ?? "",
                        })
                      }
                    }}
                  >
                    Batal
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2
                          className="animate-spin"
                          data-icon="inline-start"
                        />
                        Menyimpan...
                      </>
                    ) : (
                      <>
                        <Save data-icon="inline-start" />
                        Simpan Perubahan
                      </>
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Informasi Domain</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-sm text-muted-foreground">Nama</dt>
                        <dd className="mt-1 font-medium">{domain.name}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">URL</dt>
                        <dd className="mt-1">
                          <a
                            href={domain.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium hover:underline"
                          >
                            {domain.url}
                            <ExternalLink className="size-3" />
                          </a>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">Tema</dt>
                        <dd className="mt-1 font-medium">
                          {domain.theme?.name ?? "Belum ditetapkan"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Status
                        </dt>
                        <dd className="mt-1">
                          <Badge
                            variant="outline"
                            className={domainStatus.className}
                          >
                            {domainStatus.label}
                          </Badge>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Genre / Niche
                        </dt>
                        <dd className="mt-1 font-medium">
                          {domain.genre || "Belum ditetapkan"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Dibuat
                        </dt>
                        <dd className="mt-1 font-medium">
                          {formatDate(domain.createdAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Terakhir Diperbarui
                        </dt>
                        <dd className="mt-1 font-medium">
                          {formatDate(domain.updatedAt)}
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Server</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Label
                        </dt>
                        <dd className="mt-1 font-medium font-mono">
                          {domain.server?.label ?? "Belum ditetapkan"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Host
                        </dt>
                        <dd className="mt-1 text-sm">
                          {domain.server?.host ? (
                            <UrlLink href={domain.server.host} />
                          ) : (
                            <span className="font-mono">Belum ditetapkan</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Nameserver 1
                        </dt>
                        <dd className="mt-1 text-sm">
                          {domain.server?.name ? (
                            <UrlLink href={domain.server.name} />
                          ) : (
                            <span className="font-mono">—</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Nameserver 2
                        </dt>
                        <dd className="mt-1 text-sm">
                          {(domain.server as { nameserver2?: string })?.nameserver2 ? (
                            <UrlLink href={(domain.server as { nameserver2?: string })!.nameserver2!} />
                          ) : (
                            <span className="font-mono">—</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Articles Tab */}
          <TabsContent value="articles">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-5" />
                  Artikel
                </CardTitle>
                <CardDescription>
                  {domain.articles.length} artikel untuk domain ini.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {domain.articles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <FileText className="size-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-semibold">
                      Belum ada artikel
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Buat artikel untuk mengisi domain ini.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Judul</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Penulis</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Terbit</TableHead>
                        <TableHead>Dibuat</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {domain.articles.map((article) => {
                        const artStatus =
                          articleStatusConfig[article.status] ??
                          articleStatusConfig.draft
                        return (
                          <TableRow key={article.id}>
                            <TableCell className="font-medium">
                              {article.title}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {article.slug}
                            </TableCell>
                            <TableCell>{article.authorName}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={artStatus.className}
                              >
                                {artStatus.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(article.publishedAt)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(article.createdAt)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Deploy History Tab */}
          <TabsContent value="deploy">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="size-5" />
                  Riwayat Deploy
                </CardTitle>
                <CardDescription>
                  Aktivitas deploy terbaru untuk domain ini.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!domain.deployLogs || domain.deployLogs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Rocket className="size-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-semibold">
                      Belum ada deployment
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Deploy domain ini untuk melihat riwayat di sini.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Aksi</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>File Diubah</TableHead>
                        <TableHead>Pesan</TableHead>
                        <TableHead>Waktu Deploy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {domain.deployLogs.map((log) => {
                        const deployStatus = deployStatusConfig[log.status]
                        const StatusIcon = deployStatus?.icon ?? AlertCircle
                        const statusClass =
                          deployStatus?.className ?? "text-muted-foreground"
                        return (
                          <TableRow key={log.id}>
                            <TableCell>
                              <Badge variant="secondary">{log.action}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <StatusIcon className={`size-4 ${statusClass}`} />
                                <span className="capitalize">{log.status}</span>
                              </div>
                            </TableCell>
                            <TableCell>{log.filesChanged}</TableCell>
                            <TableCell className="max-w-xs truncate text-muted-foreground">
                              {log.message || "-"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(log.deployedAt)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SidebarInset>
  )
}
