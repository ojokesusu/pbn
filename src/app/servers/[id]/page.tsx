"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Globe,
  Loader2,
  Pencil,
  Save,
  Server as ServerIcon,
  Wifi,
} from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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

interface DomainItem {
  id: string
  name: string
  url: string
  status: string
  lastDeployed: string | null
}

interface ServerData {
  id: string
  name: string
  host: string
  username: string
  password: string
  port: number
  status: string
  createdAt: string
  updatedAt: string
  domains: DomainItem[]
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

const domainStatusConfig: Record<string, { label: string; className: string }> = {
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

export default function ServerDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [server, setServer] = useState<ServerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const [form, setForm] = useState({
    name: "",
    host: "",
    username: "",
    password: "",
    port: "21",
    status: "active",
  })

  useEffect(() => {
    fetchServer()
  }, [params.id])

  async function fetchServer() {
    try {
      const res = await fetch(`/api/servers/${params.id}`)
      if (!res.ok) throw new Error("Server not found")
      const data = await res.json()
      setServer(data)
      setForm({
        name: data.name,
        host: data.host,
        username: data.username,
        password: data.password,
        port: String(data.port),
        status: data.status,
      })
    } catch (err) {
      console.error("Failed to fetch server:", err)
      setError("Gagal memuat data server.")
    } finally {
      setLoading(false)
    }
  }

  function updateField(field: string, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value ?? "" }))
    if (error) setError("")
    if (success) setSuccess("")
    if (testResult) setTestResult(null)
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch("/api/servers/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: form.host.trim(),
          username: form.username.trim(),
          password: form.password,
          port: parseInt(form.port, 10) || 21,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setTestResult({ success: false, message: data.error || "Koneksi gagal." })
      } else {
        setTestResult({ success: true, message: "Koneksi berhasil!" })
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Koneksi gagal.",
      })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (!form.name.trim()) {
      setError("Nama server wajib diisi.")
      return
    }
    if (!form.host.trim()) {
      setError("Host / IP Address wajib diisi.")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/servers/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          host: form.host.trim(),
          username: form.username.trim(),
          password: form.password,
          port: parseInt(form.port, 10) || 21,
          status: form.status,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Gagal memperbarui server")
      }

      const updated = await res.json()
      setServer((prev) =>
        prev ? { ...prev, ...updated, domains: prev.domains } : prev
      )
      setEditing(false)
      setSuccess("Server berhasil diperbarui.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui server")
    } finally {
      setSaving(false)
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
        <AppHeader title="Detail Server" />
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

  if (!server) {
    return (
      <SidebarInset>
        <AppHeader title="Server Tidak Ditemukan" />
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <ServerIcon className="size-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">Server tidak ditemukan</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Server yang Anda cari tidak tersedia.
          </p>
          <Button className="mt-4" onClick={() => router.push("/servers")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Kembali ke Server
          </Button>
        </div>
      </SidebarInset>
    )
  }

  const serverStatus = statusConfig[server.status] ?? statusConfig.inactive

  return (
    <SidebarInset>
      <AppHeader title={server.name} />
      <div className="flex-1 space-y-6 p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => router.push("/servers")}
            >
              <ArrowLeft />
              <span className="sr-only">Kembali</span>
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold tracking-tight">
                  {server.name}
                </h2>
                <Badge variant="outline" className={serverStatus.className}>
                  {serverStatus.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground font-mono">
                {server.host}
              </p>
            </div>
          </div>
          {!editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil data-icon="inline-start" />
              Edit Server
            </Button>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription>Total Domain</CardDescription>
              <Globe className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-3xl font-bold">
                {server.domains.length}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                domain terhubung
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription>Host / IP</CardDescription>
              <ServerIcon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-xl font-bold font-mono">
                {server.host}
              </CardTitle>
              <p className="text-xs text-muted-foreground">Port: {server.port}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription>Status</CardDescription>
              <Wifi className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-xl font-bold">
                <Badge variant="outline" className={serverStatus.className}>
                  {serverStatus.label}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Status saat ini</p>
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
            <TabsTrigger value="domains">
              Domain ({server.domains.length})
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview">
            {editing ? (
              <form onSubmit={handleSave} className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Informasi Server</CardTitle>
                    <CardDescription>
                      Perbarui detail server cPanel ini.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nama Server</Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="host">Host / IP Address</Label>
                      <Input
                        id="host"
                        value={form.host}
                        onChange={(e) => updateField("host", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="username">Username cPanel</Label>
                      <Input
                        id="username"
                        value={form.username}
                        onChange={(e) => updateField("username", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password cPanel</Label>
                      <Input
                        id="password"
                        type="password"
                        value={form.password}
                        onChange={(e) => updateField("password", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="port">Port FTP</Label>
                      <Input
                        id="port"
                        type="number"
                        value={form.port}
                        onChange={(e) => updateField("port", e.target.value)}
                      />
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
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Test Koneksi</CardTitle>
                    <CardDescription>
                      Uji koneksi ke server sebelum menyimpan perubahan.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={testing}
                    >
                      {testing ? (
                        <>
                          <Loader2 className="animate-spin" data-icon="inline-start" />
                          Menguji koneksi...
                        </>
                      ) : (
                        <>
                          <Wifi data-icon="inline-start" />
                          Test Koneksi
                        </>
                      )}
                    </Button>
                    {testResult && (
                      <p
                        className={`text-sm ${
                          testResult.success ? "text-emerald-400" : "text-destructive"
                        }`}
                      >
                        {testResult.message}
                      </p>
                    )}
                  </CardContent>
                </Card>

                <div className="flex items-center justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditing(false)
                      setTestResult(null)
                      if (server) {
                        setForm({
                          name: server.name,
                          host: server.host,
                          username: server.username,
                          password: server.password,
                          port: String(server.port),
                          status: server.status,
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
                    <CardTitle>Informasi Server</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-sm text-muted-foreground">Nama</dt>
                        <dd className="mt-1 font-medium">{server.name}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">Host</dt>
                        <dd className="mt-1 font-mono text-sm">
                          {server.host}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Username
                        </dt>
                        <dd className="mt-1 font-mono text-sm">
                          {server.username || "Belum dikonfigurasi"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Password
                        </dt>
                        <dd className="mt-1 font-mono text-sm">
                          {server.password ? "********" : "Belum dikonfigurasi"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">Port</dt>
                        <dd className="mt-1 font-mono text-sm">
                          {server.port}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Status
                        </dt>
                        <dd className="mt-1">
                          <Badge
                            variant="outline"
                            className={serverStatus.className}
                          >
                            {serverStatus.label}
                          </Badge>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Dibuat
                        </dt>
                        <dd className="mt-1 font-medium">
                          {formatDate(server.createdAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground">
                          Terakhir Diperbarui
                        </dt>
                        <dd className="mt-1 font-medium">
                          {formatDate(server.updatedAt)}
                        </dd>
                      </div>
                    </dl>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Domains Tab */}
          <TabsContent value="domains">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="size-5" />
                  Domain
                </CardTitle>
                <CardDescription>
                  {server.domains.length} domain terhubung ke server ini.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {server.domains.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Globe className="size-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-semibold">
                      Belum ada domain di server ini.
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Hubungkan domain ke server ini melalui halaman domain.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Domain</TableHead>
                        <TableHead>URL</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Terakhir Deploy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {server.domains.map((domain) => {
                        const domStatus =
                          domainStatusConfig[domain.status] ??
                          domainStatusConfig.inactive
                        return (
                          <TableRow key={domain.id}>
                            <TableCell className="font-medium">
                              <Link
                                href={`/domains/${domain.id}`}
                                className="hover:underline"
                              >
                                {domain.name}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {domain.url}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={domStatus.className}
                              >
                                {domStatus.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDate(domain.lastDeployed)}
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
