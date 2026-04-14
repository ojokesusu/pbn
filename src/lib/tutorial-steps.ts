import type { DriveStep } from "driver.js";

export const dashboardTutorialSteps: DriveStep[] = [
  {
    popover: {
      title: "Selamat Datang di PBN Manager!",
      description:
        "Dashboard ini mengelola seluruh jaringan PBN Anda — dari import data, generate konten AI, deploy otomatis, hingga monitoring index Google. Mari kita pelajari setiap menu.",
      side: "over",
      align: "center",
    },
  },

  // ── Phase 1: Setup Data ──
  {
    element: '[data-tour="nav-import"]',
    popover: {
      title: "1. Import Data",
      description:
        "Mulai di sini. Import server, domain, dan backlink dari file Excel (XLSX). Bisa juga import konten dari WordPress.",
      side: "right",
      align: "center",
    },
  },
  {
    element: '[data-tour="nav-server"]',
    popover: {
      title: "2. Server",
      description:
        "Lihat semua server cPanel Anda. Setiap server punya IP unik, username, dan password FTP. Filter berdasarkan status.",
      side: "right",
      align: "center",
    },
  },
  {
    element: '[data-tour="nav-domain"]',
    popover: {
      title: "3. Domain",
      description:
        "Kelola 493 domain PBN. Filter berdasarkan: deployed/belum, alive/dead, genre, dan konten. Tombol 'Cek Situs' untuk verifikasi CSS.",
      side: "right",
      align: "center",
    },
  },

  // ── Phase 2: Content ──
  {
    element: '[data-tour="nav-themes"]',
    popover: {
      title: "4. Tema",
      description:
        "3 template profesional: Berita, Blog, Magazine. Setiap domain dapat tema unik dengan warna, font, dan layout berbeda otomatis.",
      side: "right",
      align: "center",
    },
  },
  {
    element: '[data-tour="nav-articles"]',
    popover: {
      title: "5. Artikel",
      description:
        "7,400+ artikel dari WordPress import + AI generation. Buat artikel baru manual atau gunakan Claude AI untuk generate otomatis dalam Bahasa Indonesia.",
      side: "right",
      align: "center",
    },
  },
  {
    element: '[data-tour="nav-backlinks"]',
    popover: {
      title: "6. Backlink",
      description:
        "Kelola target URL backlink. Klik Distribusi untuk menyebar link ke artikel secara otomatis. 30% artikel mendapat backlink, anchor text natural.",
      side: "right",
      align: "center",
    },
  },

  // ── Phase 3: Deploy ──
  {
    element: '[data-tour="nav-deploy"]',
    popover: {
      title: "7. Deploy",
      description:
        "Deploy website ke server via FTP. Mendukung TLS/FTPS. Setiap deploy otomatis: generate HTML + upload + override WordPress + inject inter-PBN links.",
      side: "right",
      align: "center",
    },
  },
  {
    element: '[data-tour="nav-cloudflare"]',
    popover: {
      title: "8. Cloudflare",
      description:
        "Sync DNS semua domain ke Cloudflare otomatis. Set A record dan CNAME www. Purge cache setelah deploy.",
      side: "right",
      align: "center",
    },
  },

  // ── Phase 4: Monitoring ──
  {
    element: '[data-tour="nav-health"]',
    popover: {
      title: "9. Health Check",
      description:
        "Ping semua domain untuk cek alive/dead. Deteksi WordPress yang masih aktif. Lihat daftar domain mati untuk diperbaiki tim.",
      side: "right",
      align: "center",
    },
  },
  {
    element: '[data-tour="nav-ping"]',
    popover: {
      title: "10. Google Ping / IndexNow",
      description:
        "Submit URL ke IndexNow API agar Bing & Yandex langsung crawl. Untuk Google, sistem otomatis pakai inter-PBN links.",
      side: "right",
      align: "center",
    },
  },
  {
    element: '[data-tour="nav-index"]',
    popover: {
      title: "11. Index Monitor",
      description:
        "Pantau domain mana yang sudah terindex Google. Klik 'Cek Google' untuk buka site:domain.com, lalu tandai status.",
      side: "right",
      align: "center",
    },
  },

  // ── Phase 5: Automation ──
  {
    element: '[data-tour="nav-scheduler"]',
    popover: {
      title: "12. Scheduler (Autopilot)",
      description:
        "Full autopilot: Claude AI generate artikel → deploy FTP → purge cache → submit IndexNow. Berjalan di server, tanpa buka browser. 4 artikel/minggu per domain.",
      side: "right",
      align: "center",
    },
  },

  // ── Help ──
  {
    element: '[data-tour="nav-guide"]',
    popover: {
      title: "13. Panduan",
      description:
        "Dokumentasi lengkap cara menggunakan setiap menu. Bagikan ke tim agar semua bisa pakai dashboard.",
      side: "right",
      align: "center",
    },
  },

  // ── Dashboard elements ──
  {
    element: '[data-tour="stat-cards"]',
    popover: {
      title: "Statistik Dashboard",
      description:
        "Pantau ringkasan PBN di sini — total server, domain, artikel, deploy, tema, dan backlink.",
      side: "bottom",
      align: "center",
    },
  },
  {
    element: '[data-tour="domain-table"]',
    popover: {
      title: "Daftar Domain Terbaru",
      description:
        "5 domain terbaru ditampilkan di sini. Klik nama domain untuk detail dan edit.",
      side: "top",
      align: "center",
    },
  },
  {
    element: '[data-tour="tutorial-btn"]',
    popover: {
      title: "Ulangi Tutorial",
      description:
        "Klik tombol ini kapan saja untuk melihat tutorial lagi. Selamat menggunakan PBN Manager!",
      side: "bottom",
      align: "end",
    },
  },
];
