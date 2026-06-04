"use client"

import { useEffect, useState } from "react"
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

export default function BacklinkSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [config, setConfig] = useState({
    maxPerDomain: 3,
    maxPerArticle: 1,
    percentArticles: 30,
    maxPerServerPerDay: 6,
    maxPerDay: 200,
  })

  async function fetchConfig() {
    try {
      const res = await fetch("/api/backlinks/config")
      if (res.ok) {
        const data = await res.json()
        setConfig({
          maxPerDomain: data.maxPerDomain,
          maxPerArticle: data.maxPerArticle,
          percentArticles: data.percentArticles,
          maxPerServerPerDay: data.maxPerServerPerDay ?? 6,
          maxPerDay: data.maxPerDay ?? 200,
        })
      }
    } catch (error) {
      console.error("Failed to fetch config:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/backlinks/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        await fetchConfig()
        alert("Pengaturan berhasil disimpan")
      } else {
        alert("Gagal menyimpan pengaturan")
      }
    } catch (error) {
      console.error("Failed to save config:", error)
      alert("Gagal menyimpan pengaturan")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidebarInset>
      <AppHeader title="Pengaturan Backlink" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
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
              <CardTitle style={{ color: "var(--foreground)" }}>Pengaturan Distribusi Backlink</CardTitle>
              <CardDescription style={{ color: "var(--muted-foreground)" }}>
                Atur bagaimana backlink didistribusikan ke artikel PBN Anda
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-12 rounded-lg animate-pulse" style={{ background: "var(--muted)" }} />
                  ))}
                </div>
              ) : (
                <>
                  {/* Max Per Domain */}
                  <div className="space-y-2">
                    <Label style={{ color: "var(--secondary-foreground)" }}>Maksimal Backlink per Domain</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={config.maxPerDomain}
                      onChange={(e) => setConfig({ ...config, maxPerDomain: parseInt(e.target.value) || 1 })}
                      className="rounded-lg w-32"
                      style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                    />
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      Jumlah maksimal backlink yang ditempatkan di satu domain. Rekomendasi: 1-3
                    </p>
                  </div>

                  {/* Max Per Article */}
                  <div className="space-y-2">
                    <Label style={{ color: "var(--secondary-foreground)" }}>Maksimal Backlink per Artikel</Label>
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      value={config.maxPerArticle}
                      onChange={(e) => setConfig({ ...config, maxPerArticle: parseInt(e.target.value) || 1 })}
                      className="rounded-lg w-32"
                      style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                    />
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      Jumlah maksimal backlink di satu artikel. Rekomendasi: 1
                    </p>
                  </div>

                  {/* Percent Articles */}
                  <div className="space-y-2">
                    <Label style={{ color: "var(--secondary-foreground)" }}>Persentase Artikel yang Dapat Backlink</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={5}
                        max={100}
                        value={config.percentArticles}
                        onChange={(e) => setConfig({ ...config, percentArticles: parseInt(e.target.value) || 30 })}
                        className="rounded-lg w-32"
                        style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                      />
                      <span style={{ color: "var(--muted-foreground)" }}>%</span>
                    </div>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      Berapa persen artikel yang akan mendapat backlink. Rekomendasi: 20-30%
                    </p>
                  </div>

                  {/* Max Per Server Per Day */}
                  <div className="space-y-2">
                    <Label style={{ color: "var(--secondary-foreground)" }}>Maks Backlink per Server per Hari</Label>
                    <Input
                      type="number"
                      min={1}
                      max={1000}
                      value={config.maxPerServerPerDay}
                      onChange={(e) => setConfig({ ...config, maxPerServerPerDay: parseInt(e.target.value) || 6 })}
                      className="rounded-lg w-32"
                      style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                    />
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      Cap per source server IP. Total 33 server × 6 = 198/hari potensi.
                    </p>
                  </div>

                  {/* Max Per Day (global) */}
                  <div className="space-y-2">
                    <Label style={{ color: "var(--secondary-foreground)" }}>Maks Backlink Global per Hari</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={config.maxPerDay}
                      onChange={(e) => setConfig({ ...config, maxPerDay: parseInt(e.target.value) || 200 })}
                      className="rounded-lg w-32"
                      style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                    />
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      Plafon global hari ini (ops safety). Min(server-cap × jumlah server, plafon ini).
                    </p>
                  </div>

                  {/* Info box */}
                  <div className="rounded-lg p-4" style={{ background: "rgba(14,165,233,0.06)", border: "1px solid rgba(14,165,233,0.15)" }}>
                    <p className="text-sm" style={{ color: "#0369a1" }}>
                      Pengaturan ini digunakan saat Anda klik tombol &quot;Distribusi&quot; di halaman backlink.
                      Backlink akan diacak dan disebarkan ke artikel yang sudah terbit secara otomatis.
                    </p>
                  </div>

                  {/* Save */}
                  <div className="flex justify-end pt-2">
                    <Button
                      className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? (
                        <><Loader2 className="size-4 mr-1 animate-spin" />Menyimpan...</>
                      ) : (
                        <><Save className="size-4 mr-1" />Simpan Pengaturan</>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </SidebarInset>
  )
}
