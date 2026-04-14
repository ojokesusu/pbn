"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ArrowLeft, Save, Loader2 } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Placement {
  id: string
  domain: { id: string; name: string } | null
  article: { id: string; title: string } | null
  usedAnchor: string
  createdAt: string
}

export default function EditBacklinkPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [placements, setPlacements] = useState<Placement[]>([])

  const [form, setForm] = useState({
    anchorText: "",
    targetUrl: "",
    status: "active",
  })

  useEffect(() => {
    async function fetchBacklink() {
      try {
        const res = await fetch(`/api/backlinks/${id}`)
        if (res.ok) {
          const data = await res.json()
          setForm({
            anchorText: data.anchorText,
            targetUrl: data.targetUrl,
            status: data.status,
          })
          setPlacements(data.placements ?? [])
        } else {
          alert("Backlink tidak ditemukan")
          router.push("/backlinks")
        }
      } catch (error) {
        console.error("Failed to fetch backlink:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchBacklink()
  }, [id, router])

  async function handleSave() {
    if (!form.anchorText || !form.targetUrl) {
      alert("Anchor text dan target URL wajib diisi")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/backlinks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        router.push("/backlinks")
      } else {
        const data = await res.json()
        alert(data.error || "Gagal menyimpan")
      }
    } catch (error) {
      console.error("Failed to save:", error)
      alert("Gagal menyimpan")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SidebarInset>
        <AppHeader title="Edit Backlink" />
        <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
          <div className="max-w-2xl space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--muted)" }} />
            ))}
          </div>
        </div>
      </SidebarInset>
    )
  }

  return (
    <SidebarInset>
      <AppHeader title="Edit Backlink" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Back button */}
        <Button
          variant="ghost"
          className="mb-4 rounded-lg"
          style={{ color: "var(--muted-foreground)" }}
          onClick={() => router.push("/backlinks")}
        >
          <ArrowLeft className="size-4 mr-1" />
          Kembali
        </Button>

        <div className="max-w-2xl space-y-6">
          {/* Edit Form */}
          <Card className="rounded-xl border shadow-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <CardHeader>
              <CardTitle style={{ color: "var(--foreground)" }}>Edit Backlink</CardTitle>
              <CardDescription style={{ color: "var(--muted-foreground)" }}>Ubah detail backlink</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label style={{ color: "var(--secondary-foreground)" }}>Anchor Text</Label>
                <Input
                  value={form.anchorText}
                  onChange={(e) => setForm({ ...form, anchorText: e.target.value })}
                  className="rounded-lg"
                  style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                />
              </div>

              <div className="space-y-2">
                <Label style={{ color: "var(--secondary-foreground)" }}>Target URL</Label>
                <Input
                  value={form.targetUrl}
                  onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
                  className="rounded-lg"
                  style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                />
              </div>

              <div className="space-y-2">
                <Label style={{ color: "var(--secondary-foreground)" }}>Status</Label>
                <Select value={form.status} onValueChange={(val) => setForm({ ...form, status: val ?? "" })}>
                  <SelectTrigger className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                    <SelectItem value="active">Aktif</SelectItem>
                    <SelectItem value="inactive">Nonaktif</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  className="rounded-lg"
                  style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                  onClick={() => router.push("/backlinks")}
                >
                  Batal
                </Button>
                <Button
                  className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <><Loader2 className="size-4 mr-1 animate-spin" />Menyimpan...</>
                  ) : (
                    <><Save className="size-4 mr-1" />Simpan</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Placements Table */}
          {placements.length > 0 && (
            <Card className="rounded-xl border shadow-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <CardHeader>
                <CardTitle style={{ color: "var(--foreground)" }}>
                  Penempatan
                  <Badge variant="secondary" className="ml-2 border-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                    {placements.length}
                  </Badge>
                </CardTitle>
                <CardDescription style={{ color: "var(--muted-foreground)" }}>Artikel yang sudah mendapat backlink ini</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-b" style={{ borderColor: "var(--border)" }}>
                      <TableHead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Artikel</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Domain</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Anchor Dipakai</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>Tanggal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {placements.map((p) => (
                      <TableRow key={p.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                        <TableCell className="font-medium truncate max-w-[200px]" style={{ color: "var(--secondary-foreground)" }}>
                          {p.article?.title ?? "--"}
                        </TableCell>
                        <TableCell style={{ color: "var(--muted-foreground)" }}>
                          {p.domain?.name ?? "--"}
                        </TableCell>
                        <TableCell className="font-mono text-xs" style={{ color: "#0ea5e9" }}>
                          {p.usedAnchor || "--"}
                        </TableCell>
                        <TableCell style={{ color: "var(--muted-foreground)" }}>
                          {new Date(p.createdAt).toLocaleDateString("id-ID", { year: "numeric", month: "short", day: "numeric" })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </SidebarInset>
  )
}
