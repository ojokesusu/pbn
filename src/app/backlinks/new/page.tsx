"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Loader2 } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

export default function NewBacklinkPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    anchorText: "",
    targetUrl: "",
    status: "active",
  })

  async function handleSave() {
    if (!form.targetUrl) {
      alert("Target URL wajib diisi")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/backlinks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        router.push("/backlinks")
      } else {
        const data = await res.json()
        alert(data.error || "Gagal menyimpan backlink")
      }
    } catch (error) {
      console.error("Failed to save backlink:", error)
      alert("Gagal menyimpan backlink")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidebarInset>
      <AppHeader title="Backlink Baru" />
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

        <div className="max-w-2xl">
          <Card className="rounded-xl border shadow-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <CardHeader>
              <CardTitle style={{ color: "var(--foreground)" }}>Backlink Baru</CardTitle>
              <CardDescription style={{ color: "var(--muted-foreground)" }}>Tambahkan backlink baru untuk didistribusikan ke artikel PBN</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Anchor Text */}
              <div className="space-y-2">
                <Label style={{ color: "var(--secondary-foreground)" }}>Anchor Text <span className="font-normal" style={{ color: "var(--muted-foreground)" }}>(opsional)</span></Label>
                <Input
                  placeholder="kosongkan untuk auto-pick dari artikel"
                  value={form.anchorText}
                  onChange={(e) => setForm({ ...form, anchorText: e.target.value })}
                  className="rounded-lg"
                  style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                />
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Kalau dikosongkan, sistem akan ambil kata random dari artikel sebagai anchor text (lebih natural)</p>
              </div>

              {/* Target URL */}
              <div className="space-y-2">
                <Label style={{ color: "var(--secondary-foreground)" }}>Target URL</Label>
                <Input
                  placeholder="https://example.com/halaman-target"
                  value={form.targetUrl}
                  onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
                  className="rounded-lg"
                  style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                />
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>URL tujuan ketika anchor text diklik</p>
              </div>

              {/* Status */}
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

              {/* Actions */}
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
        </div>
      </div>
    </SidebarInset>
  )
}
