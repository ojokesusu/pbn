"use client"

import { SidebarInset } from "@/components/ui/sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { Badge } from "@/components/ui/badge"
import {
  LayoutDashboard, Server, Globe, FileText, Palette, Rocket, Link2,
  Cloud, Heart, Clock, Upload, HelpCircle, ChevronDown
} from "lucide-react"
import { useState } from "react"

interface GuideSection {
  icon: React.ReactNode
  title: string
  path: string
  description: string
  steps: string[]
  tips?: string[]
  warning?: string
}

const sections: GuideSection[] = [
  {
    icon: <LayoutDashboard className="size-5" style={{ color: "#0ea5e9" }} />,
    title: "Dasbor",
    path: "/",
    description: "Halaman utama yang menampilkan ringkasan semua data: jumlah domain, server, artikel, backlink, dan deploy terbaru.",
    steps: [
      "Buka halaman utama (klik logo P di kiri atas)",
      "Lihat statistik keseluruhan di kartu-kartu bento grid",
      "Donut chart menunjukkan distribusi genre domain",
      "Activity bars menunjukkan aktivitas terbaru",
    ],
    tips: ["Refresh halaman untuk melihat data terbaru"],
  },
  {
    icon: <Server className="size-5" style={{ color: "#0ea5e9" }} />,
    title: "Server",
    path: "/servers",
    description: "Daftar semua cPanel server (489 server). Setiap server punya IP, username, password, dan port FTP.",
    steps: [
      "Lihat daftar server dengan jumlah domain di masing-masing",
      "Gunakan search bar untuk cari server berdasarkan nama, host, atau username",
      "Klik 'Test Connection' untuk cek apakah FTP server bisa diakses",
      "Klik 'Edit' untuk ubah detail server",
      "Klik 'Tambah Server' untuk menambah server baru",
    ],
    tips: [
      "Setiap domain idealnya punya 1 server sendiri (1 IP = 1 domain)",
      "Jika FTP test gagal, cek apakah firewall server memblokir koneksi",
    ],
  },
  {
    icon: <Globe className="size-5" style={{ color: "#0ea5e9" }} />,
    title: "Domain",
    path: "/domains",
    description: "Daftar semua domain PBN (493 domain). Menampilkan nama, URL, genre, server, tema, jumlah artikel, dan status health.",
    steps: [
      "Lihat semua domain dengan status 'Alive' / 'Dead' / 'WP' di kolom Health",
      "Gunakan search untuk cari domain berdasarkan nama, URL, genre, atau server",
      "Klik nama domain untuk melihat detail dan edit",
      "Klik URL untuk membuka situs di browser baru",
      "Badge 'WP 20' artinya domain punya 20 artikel WordPress terdeteksi",
    ],
    tips: [
      "Domain dengan Health '—' belum pernah di-check. Jalankan Health Check dulu",
      "Genre otomatis di-generate saat import. Bisa diubah manual",
    ],
  },
  {
    icon: <FileText className="size-5" style={{ color: "#0ea5e9" }} />,
    title: "Artikel",
    path: "/articles",
    description: "Semua artikel di database (7,400+ artikel). Bisa filter per domain, search, dan lihat detail.",
    steps: [
      "Filter artikel berdasarkan domain menggunakan dropdown",
      "Search artikel berdasarkan judul, domain, kategori, atau penulis",
      "Klik 'AI Generate' (tombol gradient) untuk generate artikel baru dengan AI",
      "Pilih domain target dan genre, lalu klik Generate",
    ],
    tips: [
      "Artikel dari WordPress Import punya URL asli di field 'aiSourceUrl'",
      "Artikel dari AI Generate punya konten unik yang tidak ada di internet lain",
    ],
  },
  {
    icon: <Palette className="size-5" style={{ color: "#0ea5e9" }} />,
    title: "Tema",
    path: "/themes",
    description: "Semua tema yang di-generate. Ada 3 template profesional: Berita, Blog, Magazine. Setiap domain punya tema unik (warna, font, layout berbeda).",
    steps: [
      "Lihat daftar tema dalam format grid",
      "Search tema berdasarkan nama, layout, atau font",
      "Klik 'Generate Tema Baru' untuk buat tema secara manual",
      "Tema otomatis di-assign ke domain saat import atau scheduler berjalan",
    ],
    tips: [
      "3 template: Berita (news), Blog (lifestyle), Magazine (entertainment)",
      "Setiap tema punya CSS prefix unik untuk menghindari fingerprint Google",
      "Warna otomatis dipilih berdasarkan genre domain",
    ],
  },
  {
    icon: <Link2 className="size-5" style={{ color: "#0ea5e9" }} />,
    title: "Backlink",
    path: "/backlinks",
    description: "Kelola 812 backlink target. Setiap backlink punya type (MS, LP, CN, RTP) untuk filtering mudah.",
    steps: [
      "Lihat daftar backlink dengan type, status, dan jumlah penempatan",
      "Filter berdasarkan type menggunakan dropdown (MS, LP, CN, RTP)",
      "Search berdasarkan anchor text atau URL",
      "Klik 'Import CSV' untuk import backlink dari file CSV",
      "Klik 'Distribusi' untuk menyisipkan backlink ke artikel secara otomatis",
      "Klik 'Pengaturan' untuk atur max backlink per domain/artikel",
    ],
    tips: [
      "Anchor text kosong = sistem otomatis pilih kata dari artikel",
      "Hanya 20-30% artikel yang mendapat backlink (pengaturan default)",
      "Jangan semua domain link ke target yang sama — variasikan!",
    ],
    warning: "Distribusi backlink akan mengubah konten artikel. Pastikan sudah benar sebelum deploy.",
  },
  {
    icon: <Rocket className="size-5" style={{ color: "#0ea5e9" }} />,
    title: "Deploy",
    path: "/deploy",
    description: "Deploy situs ke server cPanel via FTP. Ada deploy satuan dan bulk deploy.",
    steps: [
      "Deploy Satuan: pilih domain dari dropdown, klik Preview, lalu Deploy",
      "Bulk Deploy: klik banner biru di atas untuk deploy banyak domain sekaligus",
      "Bulk Deploy: pilih filter (belum pernah deploy / semua)",
      "Atur jumlah paralel FTP (default 3, max 5)",
      "Lihat log deploy di tabel bawah",
    ],
    tips: [
      "Deploy akan mengganti file di cPanel dengan situs statis kita",
      ".htaccess otomatis menimpa WordPress lama",
      "Timeout per site: 4 menit. Server yang lambat akan di-skip",
      "Setelah deploy, Cloudflare cache perlu di-purge agar pengunjung lihat versi baru",
    ],
    warning: "Deploy MENGGANTI konten di server. Backup akan hilang. Pastikan sudah benar.",
  },
  {
    icon: <Cloud className="size-5" style={{ color: "#f59e0b" }} />,
    title: "Cloudflare",
    path: "/cloudflare",
    description: "Sync DNS record semua domain ke server IP di Cloudflare. Set A record dan CNAME www otomatis.",
    steps: [
      "Klik 'Refresh' untuk scan status domain di Cloudflare",
      "Lihat berapa domain yang aktif, pending, atau belum ada di Cloudflare",
      "Klik 'Sync Semua DNS' untuk set A record (@→IP) dan CNAME (www→@) untuk semua domain",
      "Domain yang belum di-add ke Cloudflare akan muncul di daftar 'Belum di Cloudflare'",
    ],
    tips: [
      "Sync hanya mengubah DNS record, tidak mengubah konten situs",
      "Domain yang belum di Cloudflare harus di-add manual di dash.cloudflare.com",
      "11 domain saat ini belum ada di Cloudflare — perlu di-add oleh tim",
    ],
  },
  {
    icon: <Heart className="size-5" style={{ color: "#ef4444" }} />,
    title: "Health Check",
    path: "/health-check",
    description: "Ping semua 493 domain untuk cek apakah situs hidup dan apakah punya WordPress REST API.",
    steps: [
      "Klik 'Cek Semua Domain' untuk mulai scanning",
      "Tunggu 2-4 menit (scan 493 domain paralel, 10 sekaligus)",
      "Lihat hasil: Alive, Dead, WordPress terdeteksi, total posts",
      "Scroll ke bawah untuk lihat 'Domain Mati' — daftar lengkap domain yang gagal",
      "Gunakan search dan filter server untuk cari domain bermasalah",
    ],
    tips: [
      "HTTP 0 = timeout/DNS gagal (domain tidak bisa diakses sama sekali)",
      "HTTP 403 = server menolak akses (mungkin firewall)",
      "HTTP 500 = server error (cek konfigurasi cPanel)",
      "HTTP 526 = SSL certificate error di Cloudflare",
      "Domain 'Dead' tidak bisa di-deploy sampai masalahnya di-fix",
    ],
  },
  {
    icon: <Clock className="size-5" style={{ color: "#10b981" }} />,
    title: "Scheduler (Automation)",
    path: "/scheduler",
    description: "Otomatisasi penuh: generate artikel AI, deploy, dan purge cache. Semua jalan otomatis tanpa perlu klik manual.",
    steps: [
      "1. Aktifkan domain: klik 'Aktifkan semua domain yang sudah di-deploy' atau 'Aktifkan domain tanpa artikel'",
      "2. Klik 'Start' (tombol hijau kanan atas) untuk memulai scheduler",
      "3. Biarkan tab browser TETAP TERBUKA — scheduler berjalan dari browser",
      "4. Scheduler akan otomatis: pilih domain yang 'due' → generate 1 artikel baru → deploy → purge cache",
      "5. Monitor di History (20 terakhir) untuk lihat apa yang terjadi",
      "6. Klik 'Stop' kapan saja untuk menghentikan",
    ],
    tips: [
      "Scheduler berjalan setiap 10 menit selama tab terbuka",
      "4 artikel/minggu = 1 artikel setiap ~42 jam per domain (waktu random)",
      "Domain baru (tanpa artikel) akan di-setup dulu: generate 5 artikel backdated + tema",
      "Domain lama (sudah punya artikel) akan dapat 1 artikel baru setiap tick",
      "Max 15 domain diproses per hari (bisa diubah di Pengaturan)",
      "Waktu publish acak antara 06:00-23:00 — berbeda setiap domain",
    ],
    warning: "Tab browser HARUS tetap terbuka agar scheduler berjalan. Jika ditutup, scheduler berhenti sampai tab dibuka lagi.",
  },
  {
    icon: <Upload className="size-5" style={{ color: "#0ea5e9" }} />,
    title: "Import",
    path: "/import",
    description: "Import data dari file Excel (.xlsx) atau scrape konten dari WordPress.",
    steps: [
      "Import Excel: taruh file .xlsx di folder imports/, klik Scan, lalu Import",
      "Import WordPress (single): masukkan URL WordPress, scan, pilih domain tujuan, import",
      "Import WordPress (bulk): klik banner ungu untuk import semua domain WP sekaligus",
      "File Excel harus punya 3 sheet: Servers, Domains, Backlinks",
    ],
    tips: [
      "Import Excel mendukung format .xlsx (Excel) langsung — tidak perlu convert ke CSV",
      "WordPress Import hanya bekerja jika site target punya REST API aktif (/wp-json/wp/v2/posts)",
      "Bulk WP Import: max 20 artikel per site, otomatis pilih yang terbaik",
      "Import tidak menghapus data lama — hanya menambah data baru",
    ],
  },
]

function GuideCard({ section }: { section: GuideSection }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border shadow-sm overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-5 flex items-center gap-4 text-left hover:bg-[color:rgba(148,163,184,0.08)] transition-colors"
      >
        <div className="flex items-center justify-center size-10 rounded-xl shrink-0" style={{ background: "rgba(14,165,233,0.08)" }}>
          {section.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-base" style={{ color: "var(--foreground)" }}>{section.title}</h3>
            <code className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>{section.path}</code>
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>{section.description}</p>
        </div>
        <ChevronDown className={`size-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: "var(--muted-foreground)" }} />
      </button>

      {open && (
        <div className="px-6 pb-5 border-t" style={{ borderColor: "var(--border)" }}>
          {/* Steps */}
          <div className="mt-4 mb-4">
            <h4 className="text-sm font-semibold mb-2" style={{ color: "var(--secondary-foreground)" }}>Cara Pakai:</h4>
            <ol className="space-y-2">
              {section.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm" style={{ color: "var(--secondary-foreground)" }}>
                  <span className="flex items-center justify-center size-6 rounded-full shrink-0 text-xs font-bold" style={{ background: "rgba(14,165,233,0.1)", color: "#0ea5e9" }}>
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {/* Tips */}
          {section.tips && section.tips.length > 0 && (
            <div className="mb-4 p-3 rounded-lg" style={{ background: "rgba(14,165,233,0.1)" }}>
              <h4 className="text-xs font-semibold mb-2" style={{ color: "#0369a1" }}>Tips:</h4>
              <ul className="space-y-1">
                {section.tips.map((tip, i) => (
                  <li key={i} className="text-xs flex gap-2" style={{ color: "#0369a1" }}>
                    <span>•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warning */}
          {section.warning && (
            <div className="p-3 rounded-lg" style={{ background: "rgba(245,158,11,0.15)" }}>
              <p className="text-xs font-medium" style={{ color: "#92400e" }}>
                ⚠️ {section.warning}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function GuidePage() {
  return (
    <SidebarInset>
      <AppHeader title="Panduan" />
      <div className="p-6" style={{ background: "var(--background)", minHeight: "100vh" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center size-10 rounded-xl" style={{ background: "rgba(14,165,233,0.1)" }}>
            <HelpCircle className="size-5" style={{ color: "#0ea5e9" }} />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight" style={{ color: "var(--foreground)" }}>Panduan Dashboard PBN</h2>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>Klik setiap menu untuk melihat cara pakai lengkap</p>
          </div>
        </div>

        {/* Quick Start */}
        <div className="rounded-xl border p-6 mb-6 shadow-sm" style={{ background: "linear-gradient(135deg, #0ea5e9, #0284c7)", borderColor: "transparent" }}>
          <h3 className="text-lg font-bold text-white mb-3">Quick Start (5 Menit)</h3>
          <ol className="space-y-2 text-sm text-white/90">
            <li className="flex gap-2"><Badge className="bg-white/20 text-white shrink-0">1</Badge> Buka <strong>Health Check</strong> → klik "Cek Semua Domain" → tunggu 3 menit</li>
            <li className="flex gap-2"><Badge className="bg-white/20 text-white shrink-0">2</Badge> Buka <strong>Cloudflare</strong> → klik "Sync Semua DNS"</li>
            <li className="flex gap-2"><Badge className="bg-white/20 text-white shrink-0">3</Badge> Buka <strong>Scheduler</strong> → klik "Aktifkan domain yang sudah di-deploy" → klik "Start"</li>
            <li className="flex gap-2"><Badge className="bg-white/20 text-white shrink-0">4</Badge> <strong>Biarkan tab terbuka</strong> — sistem otomatis generate artikel + deploy + purge cache</li>
            <li className="flex gap-2"><Badge className="bg-white/20 text-white shrink-0">5</Badge> Cek kembali besok — lihat History di Scheduler untuk monitor progress</li>
          </ol>
        </div>

        {/* Workflow Overview */}
        <div className="rounded-xl border p-6 mb-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h3 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>Alur Kerja PBN</h3>
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <Badge className="bg-[color:var(--muted)] text-[color:var(--secondary-foreground)]">Import Data</Badge>
            <span style={{ color: "var(--muted-foreground)" }}>→</span>
            <Badge className="bg-[color:var(--muted)] text-[color:var(--secondary-foreground)]">Health Check</Badge>
            <span style={{ color: "var(--muted-foreground)" }}>→</span>
            <Badge className="bg-[color:var(--muted)] text-[color:var(--secondary-foreground)]">Cloudflare DNS</Badge>
            <span style={{ color: "var(--muted-foreground)" }}>→</span>
            <Badge className="bg-[color:var(--muted)] text-[color:var(--secondary-foreground)]">WP Import / AI Generate</Badge>
            <span style={{ color: "var(--muted-foreground)" }}>→</span>
            <Badge className="bg-[color:var(--muted)] text-[color:var(--secondary-foreground)]">Deploy</Badge>
            <span style={{ color: "var(--muted-foreground)" }}>→</span>
            <Badge className="bg-emerald-100 text-emerald-700">Scheduler (Autopilot)</Badge>
          </div>
          <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>
            Setelah setup awal selesai, Scheduler menangani semuanya otomatis: generate artikel baru → deploy → purge cache → ulangi.
          </p>
        </div>

        {/* Menu Guides */}
        <div className="space-y-3">
          {sections.map((section) => (
            <GuideCard key={section.path} section={section} />
          ))}
        </div>

        {/* Anti-Spam Rules */}
        <div className="rounded-xl border p-6 mt-6 shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <h3 className="font-semibold mb-3" style={{ color: "#ef4444" }}>Aturan Anti-Spam Google (WAJIB DIIKUTI)</h3>
          <div className="grid grid-cols-2 gap-4 text-sm" style={{ color: "var(--secondary-foreground)" }}>
            <div>
              <h4 className="font-semibold mb-2" style={{ color: "var(--secondary-foreground)" }}>JANGAN:</h4>
              <ul className="space-y-1">
                <li>❌ Deploy semua domain sekaligus</li>
                <li>❌ Publish 20+ artikel sekaligus di 1 domain</li>
                <li>❌ Link semua domain ke target yang sama</li>
                <li>❌ Daftar Google Search Console untuk PBN</li>
                <li>❌ Pasang Google Analytics di PBN</li>
                <li>❌ Gunakan 1 Gmail untuk semua domain</li>
                <li>❌ Pasang AdSense di PBN</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-2" style={{ color: "var(--secondary-foreground)" }}>LAKUKAN:</h4>
              <ul className="space-y-1">
                <li>✅ Deploy 10-15 domain per hari</li>
                <li>✅ 4 artikel per minggu per domain (otomatis via Scheduler)</li>
                <li>✅ Variasikan anchor text (60% branded, 30% naked URL, 10% keyword)</li>
                <li>✅ Beberapa domain TANPA backlink (pure content)</li>
                <li>✅ Backdating artikel 3-6 bulan untuk domain baru</li>
                <li>✅ Biarkan Google temukan situs via sitemap ping</li>
                <li>✅ Siapkan domain pengganti (expect 30-40% burn rate)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  )
}
