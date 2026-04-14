"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Save, Loader2 } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

interface Domain {
  id: string
  name: string
  url: string
}

interface Article {
  id: string
  title: string
  slug: string
  content: string
  excerpt: string
  categoryId: string | null
  tags: string
  authorName: string
  status: string
  domainId: string
  publishedAt: string | null
  domain: Domain | null
  category: { id: string; name: string } | null
}

export default function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
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
    Promise.all([
      fetch(`/api/articles/${id}`).then((r) => r.json()),
      fetch("/api/domains").then((r) => r.json()),
    ])
      .then(([article, domainsData]: [Article, Domain[]]) => {
        setDomains(domainsData)
        setForm({
          domainId: article.domainId ?? "",
          title: article.title ?? "",
          content: article.content ?? "",
          excerpt: article.excerpt ?? "",
          categoryId: article.categoryId ?? "",
          tags: article.tags ?? "",
          authorName: article.authorName ?? "",
          status: article.status ?? "draft",
        })
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  function updateField(field: string, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value ?? "" }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.domainId || !form.title || !form.content) return

    setSaving(true)
    try {
      const res = await fetch(`/api/articles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        router.push("/articles")
      } else {
        const data = await res.json()
        alert(data.error || "Failed to update article")
      }
    } catch (error) {
      console.error("Failed to update article:", error)
      alert("Failed to update article")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SidebarInset>
      <AppHeader title="Edit Artikel" />
      <div className="p-6">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.push("/articles")}>
            <ArrowLeft className="size-4 mr-1" />
            Kembali ke Artikel
          </Button>
        </div>

        {loading ? (
          <Card className="max-w-3xl">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72 mt-2" />
            </CardHeader>
            <CardContent className="space-y-5">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-8 w-full" />
            </CardContent>
          </Card>
        ) : (
          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle>Edit Artikel</CardTitle>
              <CardDescription>
                Perbarui detail artikel di bawah ini
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
                      onChange={(e) =>
                        updateField("categoryId", e.target.value)
                      }
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
                    Simpan Perubahan
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </SidebarInset>
  )
}
