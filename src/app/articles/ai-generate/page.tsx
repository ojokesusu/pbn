"use client"

import { useEffect, useState, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Sparkles, Loader2, Save, RotateCw, Zap, Search } from "lucide-react"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { UrlLink } from "@/components/ui/url-link"

interface Domain {
  id: string
  name: string
  url: string
  genre: string
  _count?: { articles: number }
}

const NEWS_SOURCES = [
  { name: "Detik", url: "https://www.detik.com/" },
  { name: "Kompas", url: "https://www.kompas.com/" },
  { name: "CNN Indonesia", url: "https://www.cnnindonesia.com/" },
  { name: "Tribunnews", url: "https://www.tribunnews.com/" },
  { name: "Liputan6", url: "https://www.liputan6.com/" },
  { name: "Tempo", url: "https://www.tempo.co/" },
  { name: "CNBC Indonesia", url: "https://www.cnbcindonesia.com/" },
  { name: "Okezone", url: "https://www.okezone.com/" },
  { name: "Suara.com", url: "https://www.suara.com/" },
  { name: "Kumparan", url: "https://kumparan.com/" },
]

const GENRES = [
  "General", "Teknologi", "Kesehatan", "Keuangan", "Travel", "Makanan",
  "Fashion", "Olahraga", "Pendidikan", "Berita", "Otomotif",
  "Properti", "Hiburan", "Bisnis", "Seni & Budaya", "Lifestyle",
]

export default function AiGeneratePage() {
  const router = useRouter()
  const [domains, setDomains] = useState<Domain[]>([])
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [mode, setMode] = useState<"auto" | "manual">("auto")

  // Domain search
  const [domainSearch, setDomainSearch] = useState("")
  const [domainDropdownOpen, setDomainDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Auto mode state
  const [autoCount, setAutoCount] = useState("5")
  const [autoNewsSource, setAutoNewsSource] = useState("__random__")
  const [autoLanguage, setAutoLanguage] = useState("Indonesia")
  const [autoWordCount, setAutoWordCount] = useState("1200")
  const [autoProgress, setAutoProgress] = useState<{ current: number; total: number; log: string[] }>({ current: 0, total: 0, log: [] })
  const [autoRunning, setAutoRunning] = useState(false)

  // Manual mode state
  const [config, setConfig] = useState({
    newsSource: "",
    topic: "",
    language: "Indonesia",
    wordCount: "1200",
    genre: "General",
    domainId: "",
  })

  const [result, setResult] = useState({
    title: "",
    content: "",
    excerpt: "",
    tags: "",
    authorName: "",
    featuredImage: "",
  })

  useEffect(() => {
    fetch("/api/domains?includeCount=true")
      .then((res) => res.json())
      .then((data) => setDomains(data))
      .catch(console.error)
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDomainDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredDomains = useMemo(() => {
    if (!domainSearch) return domains.slice(0, 50)
    const q = domainSearch.toLowerCase()
    const matches = domains.filter((d) =>
      d.name.toLowerCase().includes(q) || d.url.toLowerCase().includes(q) || (d.genre && d.genre.toLowerCase().includes(q))
    )
    // Sort: exact name match first, then starts-with, then the rest
    matches.sort((a, b) => {
      const aName = a.name.toLowerCase()
      const bName = b.name.toLowerCase()
      const aExact = aName === q ? 0 : aName.startsWith(q) ? 1 : 2
      const bExact = bName === q ? 0 : bName.startsWith(q) ? 1 : 2
      if (aExact !== bExact) return aExact - bExact
      return aName.localeCompare(bName)
    })
    return matches.slice(0, 50)
  }, [domains, domainSearch])

  const selectedDomain = domains.find((d) => d.id === config.domainId)

  function handleDomainSelect(domainId: string) {
    const domain = domains.find((d) => d.id === domainId)
    setConfig((prev) => ({
      ...prev,
      domainId,
      genre: domain?.genre || prev.genre,
    }))
    setDomainSearch("")
    setDomainDropdownOpen(false)
  }

  const [usedSource, setUsedSource] = useState("")
  const [generationMode, setGenerationMode] = useState<"ai" | "mock" | "">("")

  // ── Manual Generate ──
  async function handleGenerate() {
    if (!config.newsSource && !config.topic) {
      alert("Pilih sumber berita atau masukkan topik manual")
      return
    }

    // Handle random source selection
    let actualSource = config.newsSource
    if (config.newsSource === "__random__") {
      const picked = NEWS_SOURCES[Math.floor(Math.random() * NEWS_SOURCES.length)]
      actualSource = picked.url
      setUsedSource(picked.name)
    } else if (config.newsSource) {
      const found = NEWS_SOURCES.find((s) => s.url === config.newsSource)
      setUsedSource(found?.name || config.newsSource)
    } else {
      setUsedSource("")
    }

    setGenerating(true)
    setGenerated(false)
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsSource: actualSource || undefined,
          topic: config.topic || undefined,
          language: config.language,
          wordCount: parseInt(config.wordCount),
          genre: config.genre,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setResult({
          title: data.title || "",
          content: data.content || "",
          excerpt: data.excerpt || "",
          tags: data.tags || "",
          authorName: data.authorName || "",
          featuredImage: data.featuredImage || "",
        })
        setGenerationMode(data.mode || "ai")
        setGenerated(true)
      } else {
        alert(data.error || "Gagal generate artikel")
      }
    } catch (error) {
      console.error("AI generation failed:", error)
      alert("Gagal generate artikel")
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!config.domainId) {
      alert("Pilih domain dulu")
      return
    }
    if (!result.title || !result.content) return

    setSaving(true)
    try {
      const res = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          content: result.content,
          excerpt: result.excerpt,
          tags: result.tags,
          authorName: result.authorName,
          featuredImage: result.featuredImage,
          domainId: config.domainId,
          status: "draft",
          aiSourceUrl: config.newsSource || "",
        }),
      })

      if (res.ok) {
        router.push("/articles")
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

  // ── Auto Generate ──
  async function handleAutoGenerate() {
    const count = parseInt(autoCount)
    if (count < 1) return

    // Sort domains by fewest articles first
    const sorted = [...domains]
      .filter((d) => d.genre)
      .sort((a, b) => (a._count?.articles ?? 0) - (b._count?.articles ?? 0))

    if (sorted.length === 0) {
      alert("Tidak ada domain dengan genre. Set genre di setiap domain dulu.")
      return
    }

    setAutoRunning(true)
    setAutoProgress({ current: 0, total: count, log: [] })

    for (let i = 0; i < count; i++) {
      // Pick domain round-robin from least articles
      const domain = sorted[i % sorted.length]

      // Pick news source (random or fixed)
      let sourceUrl = autoNewsSource
      let sourceName = ""
      if (autoNewsSource === "__random__") {
        const picked = NEWS_SOURCES[Math.floor(Math.random() * NEWS_SOURCES.length)]
        sourceUrl = picked.url
        sourceName = picked.name
      } else {
        sourceName = NEWS_SOURCES.find((s) => s.url === autoNewsSource)?.name || autoNewsSource
      }

      setAutoProgress((prev) => ({
        ...prev,
        current: i + 1,
        log: [...prev.log, `[${i + 1}/${count}] ${domain.name} (${domain.genre}) ← ${sourceName}...`],
      }))

      try {
        // Generate article
        const genRes = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newsSource: sourceUrl,
            language: autoLanguage,
            wordCount: parseInt(autoWordCount),
            genre: domain.genre,
          }),
        })

        if (!genRes.ok) {
          const err = await genRes.json()
          setAutoProgress((prev) => ({
            ...prev,
            log: [...prev.log, `  ✗ Gagal: ${err.error}`],
          }))
          continue
        }

        const article = await genRes.json()

        // Save article to domain
        const saveRes = await fetch("/api/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: article.title,
            content: article.content,
            excerpt: article.excerpt,
            tags: article.tags,
            authorName: article.authorName,
            domainId: domain.id,
            status: "published",
            aiSourceUrl: autoNewsSource,
          }),
        })

        if (saveRes.ok) {
          setAutoProgress((prev) => ({
            ...prev,
            log: [...prev.log, `  ✓ "${article.title}" → ${domain.name}`],
          }))
        } else {
          setAutoProgress((prev) => ({
            ...prev,
            log: [...prev.log, `  ✗ Gagal simpan ke ${domain.name}`],
          }))
        }
      } catch (error) {
        console.error("Auto generate error:", error)
        setAutoProgress((prev) => ({
          ...prev,
          log: [...prev.log, `  ✗ Error: ${error}`],
        }))
      }
    }

    setAutoProgress((prev) => ({
      ...prev,
      log: [...prev.log, `\nSelesai! ${count} artikel diproses.`],
    }))
    setAutoRunning(false)
  }

  return (
    <SidebarInset>
      <AppHeader title="AI Generate Artikel" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        <Button
          variant="ghost"
          className="mb-4 rounded-lg"
          style={{ color: "var(--muted-foreground)" }}
          onClick={() => router.push("/articles")}
        >
          <ArrowLeft className="size-4 mr-1" />
          Kembali
        </Button>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "auto" | "manual")} className="space-y-6">
          <TabsList className="rounded-lg" style={{ background: "var(--muted)" }}>
            <TabsTrigger value="auto" className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Zap className="size-4 mr-1" />
              Auto Mode
            </TabsTrigger>
            <TabsTrigger value="manual" className="rounded-md data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Sparkles className="size-4 mr-1" />
              Manual Mode
            </TabsTrigger>
          </TabsList>

          {/* ══════════════ AUTO MODE ══════════════ */}
          <TabsContent value="auto">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-xl border shadow-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" style={{ color: "var(--foreground)" }}>
                    <Zap className="size-5" style={{ color: "#f59e0b" }} />
                    Auto Generate
                  </CardTitle>
                  <CardDescription style={{ color: "var(--muted-foreground)" }}>
                    Sistem otomatis pilih domain yang butuh artikel, generate, dan simpan. Tinggal klik satu tombol.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* News Source */}
                  <div className="space-y-2">
                    <Label style={{ color: "var(--secondary-foreground)" }}>Sumber Berita</Label>
                    <Select value={autoNewsSource} onValueChange={(v) => setAutoNewsSource(v ?? "")}>
                      <SelectTrigger className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                        <SelectItem value="__random__">🎲 Random (beda tiap artikel)</SelectItem>
                        {NEWS_SOURCES.map((s) => (
                          <SelectItem key={s.url} value={s.url}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    {/* Count */}
                    <div className="space-y-2">
                      <Label style={{ color: "var(--secondary-foreground)" }}>Jumlah Artikel</Label>
                      <Select value={autoCount} onValueChange={(v) => setAutoCount(v ?? "")}>
                        <SelectTrigger className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                          <SelectItem value="1">1 artikel</SelectItem>
                          <SelectItem value="3">3 artikel</SelectItem>
                          <SelectItem value="5">5 artikel</SelectItem>
                          <SelectItem value="10">10 artikel</SelectItem>
                          <SelectItem value="20">20 artikel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Word Count */}
                    <div className="space-y-2">
                      <Label style={{ color: "var(--secondary-foreground)" }}>Jumlah Kata</Label>
                      <Select value={autoWordCount} onValueChange={(v) => setAutoWordCount(v ?? "")}>
                        <SelectTrigger className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                          <SelectItem value="800">800 kata</SelectItem>
                          <SelectItem value="1200">1200 kata</SelectItem>
                          <SelectItem value="1500">1500 kata</SelectItem>
                          <SelectItem value="2000">2000 kata</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Language */}
                    <div className="space-y-2">
                      <Label style={{ color: "var(--secondary-foreground)" }}>Bahasa</Label>
                      <Select value={autoLanguage} onValueChange={(v) => setAutoLanguage(v ?? "")}>
                        <SelectTrigger className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                          <SelectItem value="Indonesia">Indonesia</SelectItem>
                          <SelectItem value="English">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="rounded-lg p-4" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
                    <p className="text-sm" style={{ color: "#92400e" }}>
                      <strong>Cara kerja:</strong> Sistem pilih domain dengan artikel paling sedikit → Baca headline dari sumber berita → Generate artikel sesuai genre domain → Simpan otomatis sebagai published.
                    </p>
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-[#f59e0b] to-[#ef4444] hover:from-[#d97706] hover:to-[#dc2626] text-white rounded-lg shadow-lg transition-all"
                    onClick={handleAutoGenerate}
                    disabled={autoRunning}
                  >
                    {autoRunning ? (
                      <><Loader2 className="size-4 mr-2 animate-spin" />Generating {autoProgress.current}/{autoProgress.total}...</>
                    ) : (
                      <><Zap className="size-4 mr-2" />Auto Generate {autoCount} Artikel</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Auto Progress Log */}
              <Card className="rounded-xl border shadow-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <CardHeader>
                  <CardTitle style={{ color: "var(--foreground)" }}>Progress</CardTitle>
                  <CardDescription style={{ color: "var(--muted-foreground)" }}>
                    {autoRunning ? `Generating ${autoProgress.current}/${autoProgress.total}...` : autoProgress.log.length > 0 ? "Selesai" : "Klik Auto Generate untuk mulai"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {autoProgress.log.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Zap className="size-12 mb-4" style={{ color: "rgba(245,158,11,0.3)" }} />
                      <p style={{ color: "var(--muted-foreground)" }}>Progress akan muncul di sini</p>
                    </div>
                  ) : (
                    <div
                      className="rounded-lg border p-4 max-h-[500px] overflow-y-auto font-mono text-xs space-y-1"
                      style={{ borderColor: "var(--border)", background: "var(--foreground)", color: "var(--border)" }}
                    >
                      {autoProgress.log.map((line, i) => (
                        <div key={i} className={line.includes("✓") ? "text-emerald-400" : line.includes("✗") ? "text-red-400" : "text-sky-300"}>
                          {line}
                        </div>
                      ))}
                      {autoRunning && <div className="animate-pulse text-yellow-300">▊</div>}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ══════════════ MANUAL MODE ══════════════ */}
          <TabsContent value="manual">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-xl border shadow-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2" style={{ color: "var(--foreground)" }}>
                    <Sparkles className="size-5" style={{ color: "#0ea5e9" }} />
                    Manual Generate
                  </CardTitle>
                  <CardDescription style={{ color: "var(--muted-foreground)" }}>
                    Pilih domain dan sumber berita sendiri, preview sebelum simpan
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Domain with search */}
                  <div className="space-y-2">
                    <Label style={{ color: "var(--secondary-foreground)" }}>Domain *</Label>
                    <div className="relative" ref={dropdownRef}>
                      <div
                        className="flex items-center rounded-lg border px-3 py-2 cursor-pointer"
                        style={{ borderColor: "var(--border)", background: "var(--card)" }}
                        onClick={() => setDomainDropdownOpen(!domainDropdownOpen)}
                      >
                        {selectedDomain ? (
                          <span style={{ color: "var(--secondary-foreground)" }}>
                            {selectedDomain.name}
                            <span className="ml-2 text-xs" style={{ color: "var(--muted-foreground)" }}><UrlLink href={selectedDomain.url} truncate={50} /></span>
                            {selectedDomain.genre ? <Badge variant="secondary" className="ml-1 text-[10px] border-0" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>{selectedDomain.genre}</Badge> : ""}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted-foreground)" }}>Cari domain... (ketik nama, URL, atau genre)</span>
                        )}
                      </div>
                      {domainDropdownOpen && (
                        <div className="absolute z-50 mt-1 w-full rounded-lg border shadow-xl" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                          <div className="p-2 border-b" style={{ borderColor: "var(--border)" }}>
                            <div className="flex items-center gap-2 px-2">
                              <Search className="size-4" style={{ color: "var(--muted-foreground)" }} />
                              <input
                                className="w-full bg-transparent text-sm outline-none"
                                style={{ color: "var(--secondary-foreground)" }}
                                placeholder="Ketik nama domain, URL, atau genre..."
                                value={domainSearch}
                                onChange={(e) => setDomainSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-[250px] overflow-y-auto">
                            {filteredDomains.length === 0 ? (
                              <div className="p-4 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>Tidak ditemukan</div>
                            ) : (
                              filteredDomains.map((d) => (
                                <div
                                  key={d.id}
                                  className="px-3 py-2 cursor-pointer transition-colors text-sm hover:bg-[rgba(14,165,233,0.06)]"
                                  style={{ color: "var(--secondary-foreground)" }}
                                  onClick={() => handleDomainSelect(d.id)}
                                >
                                  <div className="font-medium">{d.name}</div>
                                  <div className="text-xs flex items-center gap-2" style={{ color: "var(--muted-foreground)" }}>
                                    <span className="truncate"><UrlLink href={d.url} truncate={50} /></span>
                                    {d.genre && <span>· {d.genre}</span>}
                                    <span>· {d._count?.articles ?? 0} artikel</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* News Source */}
                  <div className="space-y-2">
                    <Label style={{ color: "var(--secondary-foreground)" }}>Sumber Berita</Label>
                    <Select value={config.newsSource} onValueChange={(val) => setConfig({ ...config, newsSource: (val ?? "") === "__none__" ? "" : (val ?? "") })}>
                      <SelectTrigger className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                        <SelectValue placeholder="Pilih sumber berita" />
                      </SelectTrigger>
                      <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                        <SelectItem value="__none__">-- Topik manual --</SelectItem>
                        <SelectItem value="__random__">🎲 Random (pilih acak)</SelectItem>
                        {NEWS_SOURCES.map((s) => (
                          <SelectItem key={s.url} value={s.url}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Manual Topic */}
                  <div className="space-y-2">
                    <Label style={{ color: "var(--secondary-foreground)" }}>
                      Topik Manual <span className="font-normal" style={{ color: "var(--muted-foreground)" }}>(opsional)</span>
                    </Label>
                    <Input
                      placeholder="contoh: Cara Memilih Hosting Terbaik"
                      value={config.topic}
                      onChange={(e) => setConfig({ ...config, topic: e.target.value })}
                      className="rounded-lg"
                      style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label style={{ color: "var(--secondary-foreground)" }}>Niche</Label>
                      <Select value={config.genre} onValueChange={(val) => setConfig({ ...config, genre: val ?? "" })}>
                        <SelectTrigger className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                          {GENRES.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label style={{ color: "var(--secondary-foreground)" }}>Jumlah Kata</Label>
                      <Select value={config.wordCount} onValueChange={(val) => setConfig({ ...config, wordCount: val ?? "" })}>
                        <SelectTrigger className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                          <SelectItem value="800">800 kata</SelectItem>
                          <SelectItem value="1200">1200 kata</SelectItem>
                          <SelectItem value="1500">1500 kata</SelectItem>
                          <SelectItem value="2000">2000 kata</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label style={{ color: "var(--secondary-foreground)" }}>Bahasa</Label>
                      <Select value={config.language} onValueChange={(val) => setConfig({ ...config, language: val ?? "" })}>
                        <SelectTrigger className="rounded-lg" style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                          <SelectItem value="Indonesia">Indonesia</SelectItem>
                          <SelectItem value="English">English</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button
                    className="w-full bg-gradient-to-r from-[#0ea5e9] to-[#8b5cf6] hover:from-[#0284c7] hover:to-[#7c3aed] text-white rounded-lg shadow-lg transition-all"
                    onClick={handleGenerate}
                    disabled={generating}
                  >
                    {generating ? (
                      <><Loader2 className="size-4 mr-2 animate-spin" />AI sedang menulis...</>
                    ) : (
                      <><Sparkles className="size-4 mr-2" />Generate Artikel</>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {/* Manual Result */}
              <Card className="rounded-xl border shadow-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
                <CardHeader>
                  <CardTitle style={{ color: "var(--foreground)" }}>Hasil Generate</CardTitle>
                  <CardDescription style={{ color: "var(--muted-foreground)" }}>
                    {generated ? "Preview — bisa diedit sebelum simpan" : "Hasil muncul di sini setelah generate"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!generated && !generating ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Sparkles className="size-12 mb-4" style={{ color: "rgba(14,165,233,0.3)" }} />
                      <p style={{ color: "var(--muted-foreground)" }}>Pilih sumber berita dan klik Generate</p>
                    </div>
                  ) : generating ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Loader2 className="size-12 mb-4 animate-spin" style={{ color: "#0ea5e9" }} />
                      <p style={{ color: "var(--muted-foreground)" }}>AI sedang menulis artikel...</p>
                      <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>10-30 detik</p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-lg px-3 py-2 text-sm flex items-center gap-2" style={{ background: "rgba(14,165,233,0.06)", color: "#0369a1" }}>
                        {usedSource && <>Sumber: <strong>{usedSource}</strong></>}
                        {generationMode && (
                          <Badge variant="outline" className="ml-auto text-[10px]" style={{
                            background: generationMode === "mock" ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)",
                            color: generationMode === "mock" ? "#92400e" : "#065f46",
                            borderColor: generationMode === "mock" ? "rgba(245,158,11,0.3)" : "rgba(16,185,129,0.3)",
                          }}>
                            {generationMode === "mock" ? "Mock Mode" : "Gemini AI"}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label style={{ color: "var(--secondary-foreground)" }}>Judul</Label>
                        <Input
                          value={result.title}
                          onChange={(e) => setResult({ ...result, title: e.target.value })}
                          className="rounded-lg font-semibold"
                          style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label style={{ color: "var(--secondary-foreground)" }}>Penulis</Label>
                        <Input
                          value={result.authorName}
                          onChange={(e) => setResult({ ...result, authorName: e.target.value })}
                          className="rounded-lg"
                          style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label style={{ color: "var(--secondary-foreground)" }}>Ringkasan</Label>
                        <Textarea
                          value={result.excerpt}
                          onChange={(e) => setResult({ ...result, excerpt: e.target.value })}
                          rows={2}
                          className="rounded-lg"
                          style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label style={{ color: "var(--secondary-foreground)" }}>Konten</Label>
                        <div
                          className="rounded-lg border p-4 max-h-[400px] overflow-y-auto prose prose-sm"
                          style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                          dangerouslySetInnerHTML={{ __html: result.content }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label style={{ color: "var(--secondary-foreground)" }}>Tags</Label>
                        <Input
                          value={result.tags}
                          onChange={(e) => setResult({ ...result, tags: e.target.value })}
                          className="rounded-lg"
                          style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button
                          variant="outline"
                          className="rounded-lg"
                          style={{ borderColor: "var(--border)", color: "var(--secondary-foreground)" }}
                          onClick={handleGenerate}
                          disabled={generating}
                        >
                          <RotateCw className="size-4 mr-1" />
                          Regenerate
                        </Button>
                        <Button
                          className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-lg shadow-lg shadow-[#0ea5e9]/20"
                          onClick={handleSave}
                          disabled={saving || !config.domainId}
                        >
                          {saving ? (
                            <><Loader2 className="size-4 mr-1 animate-spin" />Menyimpan...</>
                          ) : (
                            <><Save className="size-4 mr-1" />Simpan sebagai Artikel</>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </SidebarInset>
  )
}
