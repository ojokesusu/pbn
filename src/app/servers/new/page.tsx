"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Save, Wifi } from "lucide-react"

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

export default function NewServerPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
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

  function updateField(field: string, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value ?? "" }))
    if (error) setError("")
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

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
      const res = await fetch("/api/servers", {
        method: "POST",
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
        throw new Error(data.error || "Gagal membuat server")
      }

      router.push("/servers")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat server")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidebarInset>
      <AppHeader title="Tambah Server" />
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" onClick={() => router.push("/servers")}>
            <ArrowLeft />
            <span className="sr-only">Kembali ke server</span>
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Tambah Server</h2>
            <p className="text-muted-foreground">
              Tambahkan server cPanel baru untuk deploy domain.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Informasi Server</CardTitle>
              <CardDescription>
                Detail dasar tentang server cPanel.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nama Server</Label>
                <Input
                  id="name"
                  placeholder="cth. Server Utama PBN"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="host">Host / IP Address</Label>
                <Input
                  id="host"
                  placeholder="192.168.1.1"
                  value={form.host}
                  onChange={(e) => updateField("host", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username cPanel</Label>
                <Input
                  id="username"
                  placeholder="username"
                  value={form.username}
                  onChange={(e) => updateField("username", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password cPanel</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="password"
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">Port FTP</Label>
                <Input
                  id="port"
                  type="number"
                  placeholder="21"
                  value={form.port}
                  onChange={(e) => updateField("port", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(val) => updateField("status", val as string)}
                >
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="inactive">Nonaktif</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Test Koneksi</CardTitle>
              <CardDescription>
                Uji koneksi ke server sebelum menyimpan.
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
            <Button variant="outline" onClick={() => router.push("/servers")}>
              Batal
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Save data-icon="inline-start" />
                  Buat Server
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </SidebarInset>
  )
}
