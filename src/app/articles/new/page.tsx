"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Loader2 } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

interface Domain {
  id: string
  name: string
  url: string
}

export default function NewArticlePage() {
  const router = useRouter()
  const [domains, setDomains] = useState<Domain[]>([])
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    domainId: "",
    title: "",
    content: "",
    excerpt: "",
    categoryId: "",
    tags: "",
    authorName: "",
    status: "draft",
  })

  useEffect(() => {
    fetch("/api/domains")
      .then((res) => res.json())
      .then((data) => setDomains(data))
      .catch(console.error)
  }, [])

  function updateField(field: string, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value ?? "" }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.domainId || !form.title || !form.content) return

    setSaving(true)
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        router.push("/articles")
      } else {
        const data = await res.json()
        alert(data.error || "Failed to create article")
      }
    } catch (error) {
      console.error("Failed to create article:", error)
      alert("Failed to create article")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidebarInset>
      <AppHeader title="Artikel Baru" />
      <div className="p-6">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.push("/articles")}>
            <ArrowLeft className="size-4 mr-1" />
            Kembali ke Artikel
          </Button>
        </div>

        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Buat Artikel Baru</CardTitle>
            <CardDescription>
              Isi detail di bawah ini untuk membuat artikel baru
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="domainId">Domain *</Label>
                  <Select
                    value={form.domainId}
                    onValueChange={(val) => updateField("domainId", val)}
                    required
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {domains.map((domain) => (
                        <SelectItem key={domain.id} value={domain.id}>
                          {domain.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(val) => updateField("status", val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draf</SelectItem>
                      <SelectItem value="published">Terbit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Judul *</Label>
                <Input
                  id="title"
                  placeholder="Judul artikel"
                  value={form.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Konten *</Label>
                <Textarea
                  id="content"
                  placeholder="Tulis konten artikel Anda di sini..."
                  rows={20}
                  className="min-h-[400px]"
                  value={form.content}
                  onChange={(e) => updateField("content", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="excerpt">Ringkasan</Label>
                <Textarea
                  id="excerpt"
                  placeholder="Ringkasan singkat dari artikel"
                  rows={3}
                  value={form.excerpt}
                  onChange={(e) => updateField("excerpt", e.target.value)}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="categoryId">Kategori</Label>
                  <Input
                    id="categoryId"
                    placeholder="Kategori"
                    value={form.categoryId}
                    onChange={(e) => updateField("categoryId", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">Tag</Label>
                  <Input
                    id="tags"
                    placeholder="Tag dipisahkan koma"
                    value={form.tags}
                    onChange={(e) => updateField("tags", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="authorName">Nama Penulis</Label>
                <Input
                  id="authorName"
                  placeholder="Nama penulis"
                  value={form.authorName}
                  onChange={(e) => updateField("authorName", e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" type="button" onClick={() => router.push("/articles")}>
                  Batal
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <Loader2 className="size-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="size-4 mr-1" />
                  )}
                  Buat Artikel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  )
}
