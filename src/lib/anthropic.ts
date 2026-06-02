// ── Anthropic Claude API client for PBN content generation ──
// Generates natural Indonesian articles using Claude

import { prisma } from "./db";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

// Claude Haiku 4.5 pricing (USD per 1M tokens) — update when Anthropic changes them.
// Source: https://www.anthropic.com/pricing
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-opus-4-5": { input: 15.0, output: 75.0 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[model] || MODEL_PRICING["claude-haiku-4-5-20251001"];
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

async function recordApiUsage(opts: {
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  domainId?: string;
}) {
  try {
    const totalTokens = opts.inputTokens + opts.outputTokens;
    const costUsd = estimateCost(opts.model, opts.inputTokens, opts.outputTokens);
    await prisma.apiUsage.create({
      data: {
        provider: "claude",
        model: opts.model,
        operation: opts.operation,
        inputTokens: opts.inputTokens,
        outputTokens: opts.outputTokens,
        totalTokens,
        costUsd,
        domainId: opts.domainId ?? null,
      },
    });
  } catch (err) {
    // Non-critical — don't break the caller
    console.error("[api-usage] record failed:", err);
  }
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY tidak ada di .env");
  return key;
}

interface GeneratedArticle {
  title: string;
  content: string; // HTML formatted
  excerpt: string;
  tags: string; // comma-separated
  category: string;
}

const GENRE_TOPICS: Record<string, string[]> = {
  Teknologi: [
    "perkembangan AI di Indonesia", "tips keamanan siber", "review gadget terbaru",
    "cloud computing untuk bisnis", "tren teknologi masa depan", "cara memilih laptop",
    "aplikasi produktivitas terbaik", "coding untuk pemula", "internet of things",
    "startup teknologi Indonesia",
  ],
  Kesehatan: [
    "pola makan sehat", "olahraga di rumah", "kesehatan mental", "tips tidur berkualitas",
    "suplemen vitamin", "diet seimbang", "manfaat yoga", "kesehatan jantung",
    "imunitas tubuh", "kesehatan anak",
  ],
  Keuangan: [
    "investasi untuk pemula", "cara menabung efektif", "reksa dana", "saham Indonesia",
    "perencanaan keuangan", "tips hemat belanja", "asuransi jiwa", "dana pensiun",
    "fintech Indonesia", "kripto dan blockchain",
  ],
  Travel: [
    "destinasi wisata Indonesia", "tips traveling hemat", "pantai terindah Bali",
    "wisata alam Jogja", "kuliner khas daerah", "backpacking Asia Tenggara",
    "hotel unik Indonesia", "wisata budaya", "gunung terbaik untuk hiking",
    "tips foto traveling",
  ],
  Kuliner: [
    "resep masakan Indonesia", "street food terbaik", "kopi nusantara", "rendang autentik",
    "makanan sehat", "resep mudah untuk pemula", "kuliner khas Jakarta",
    "tren makanan", "restoran terbaik", "camilan sehat",
  ],
  Fashion: [
    "tren fashion terkini", "mix and match outfit", "sustainable fashion",
    "fashion pria Indonesia", "aksesoris wanita", "tips berpakaian formal",
    "fashion hijab modern", "brand lokal terbaik", "tren warna musim ini",
    "outfit kerja casual",
  ],
  Olahraga: [
    "liga sepak bola Indonesia", "tips latihan gym", "lari maraton", "bulu tangkis",
    "olahraga air", "nutrisi atlet", "yoga pemula", "esports Indonesia",
    "jadwal pertandingan", "sejarah olahraga",
  ],
  Pendidikan: [
    "tips belajar efektif", "beasiswa luar negeri", "jurusan kuliah terbaik",
    "e-learning", "soft skills", "persiapan UTBK", "belajar bahasa asing",
    "pendidikan karakter", "homeschooling", "gap year",
  ],
  Berita: [
    "ekonomi Indonesia terkini", "kebijakan pemerintah baru", "isu lingkungan",
    "perkembangan politik", "inovasi startup", "infrastruktur baru",
    "pariwisata Indonesia", "hubungan internasional", "teknologi di Indonesia",
    "sosial budaya",
  ],
  Otomotif: [
    "mobil listrik terbaru", "perawatan mobil", "SUV terpopuler", "motor terbaru",
    "tips berkendara aman", "modifikasi mobil", "perbandingan mobil",
    "teknologi kendaraan", "mobil bekas berkualitas", "aksesoris mobil",
  ],
  Properti: [
    "tips beli rumah pertama", "investasi properti", "desain interior minimalis",
    "KPR terbaik", "apartemen vs rumah", "renovasi rumah", "taman rumah",
    "properti komersial", "arsitektur modern", "smart home",
  ],
  Hiburan: [
    "film Indonesia terbaru", "series Netflix terbaik", "konser musik",
    "game mobile populer", "podcast Indonesia", "K-pop di Indonesia",
    "festival musik", "stand-up comedy", "animasi Indonesia", "drama Korea",
  ],
  Bisnis: [
    "strategi UMKM", "bisnis online", "digital marketing", "leadership",
    "franchise terbaik", "branding bisnis", "manajemen keuangan bisnis",
    "customer service", "supply chain", "e-commerce Indonesia",
  ],
  "Seni & Budaya": [
    "batik Indonesia", "festival budaya", "seniman muda", "arsitektur tradisional",
    "wayang kulit", "tari tradisional", "musik tradisional", "kerajinan tangan",
    "museum Indonesia", "seni kontemporer",
  ],
  Lingkungan: [
    "perubahan iklim Indonesia", "energi terbarukan", "daur ulang sampah",
    "konservasi hutan", "polusi udara", "pertanian organik", "keanekaragaman hayati",
    "laut Indonesia", "go green", "eco-friendly lifestyle",
  ],
  Parenting: [
    "perkembangan anak", "tips parenting modern", "nutrisi anak", "pendidikan anak usia dini",
    "mainan edukatif", "kesehatan ibu hamil", "MPASI bayi", "disiplin positif",
    "screen time anak", "keluarga harmonis",
  ],
  Gaming: [
    "game mobile terbaik", "esports Indonesia", "tips bermain MOBA", "console gaming",
    "game indie Indonesia", "streaming game", "review game terbaru",
    "build PC gaming", "game strategi", "game edukasi",
  ],
  Fotografi: [
    "tips fotografi pemula", "kamera terbaik", "foto landscape", "editing foto",
    "street photography", "fotografi smartphone", "portrait photography",
    "foto produk", "drone photography", "komposisi foto",
  ],
  Musik: [
    "musik Indonesia terkini", "belajar gitar", "alat musik tradisional",
    "produksi musik digital", "chord lagu populer", "sejarah musik Indonesia",
    "playlist terbaik", "festival musik", "musisi indie", "vokal dan teknik bernyanyi",
  ],
  Pertanian: [
    "pertanian modern", "hidroponik rumahan", "budidaya tanaman", "pupuk organik",
    "urban farming", "teknologi pertanian", "peternakan", "agribisnis",
    "tanaman hias", "kebun sayur",
  ],
  iGaming: [
    "tren industri iGaming global", "perkembangan esports Asia", "inovasi platform gaming online",
    "sejarah game populer", "teknologi live streaming game", "komunitas gamer Indonesia",
    "turnamen esports internasional", "review platform gaming terbaru",
    "karier profesional di industri gaming", "inovasi AI untuk game",
    "tips memilih platform hiburan digital", "teknologi VR dalam game",
    "dampak ekonomi industri gaming", "regulasi gaming di Asia Tenggara",
    "inovasi mobile gaming",
  ],
};

const CATEGORY_NAMES: Record<string, string[]> = {
  Teknologi: ["Teknologi", "Digital", "Gadget", "Review", "Tutorial"],
  Kesehatan: ["Kesehatan", "Wellness", "Tips Sehat", "Nutrisi", "Olahraga"],
  Keuangan: ["Keuangan", "Investasi", "Tips Hemat", "Finansial", "Ekonomi"],
  Travel: ["Travel", "Wisata", "Destinasi", "Kuliner Lokal", "Tips Traveling"],
  Kuliner: ["Kuliner", "Resep", "Review Makanan", "Tips Memasak", "Street Food"],
  Fashion: ["Fashion", "Style", "Trend", "Tips Fashion", "Aksesoris"],
  Olahraga: ["Olahraga", "Sepak Bola", "Fitness", "Berita Bola", "Tips Olahraga"],
  Pendidikan: ["Pendidikan", "Beasiswa", "Tips Belajar", "Kampus", "Karir"],
  Berita: ["Berita", "Nasional", "Politik", "Ekonomi", "Internasional"],
  Otomotif: ["Otomotif", "Mobil", "Motor", "Review Kendaraan", "Tips Otomotif"],
  Properti: ["Properti", "Rumah", "Desain Interior", "Investasi Properti", "Tips Hunian"],
  Hiburan: ["Hiburan", "Film", "Musik", "Game", "Selebriti"],
  Bisnis: ["Bisnis", "UMKM", "Marketing", "Startup", "Entrepreneurship"],
  "Seni & Budaya": ["Seni", "Budaya", "Tradisional", "Galeri", "Festival"],
  Lingkungan: ["Lingkungan", "Go Green", "Konservasi", "Energi", "Ekologi"],
  Parenting: ["Parenting", "Anak", "Keluarga", "Tumbuh Kembang", "Ibu & Anak"],
  Gaming: ["Gaming", "Esports", "Review Game", "Tips Game", "Mobile Gaming"],
  Fotografi: ["Fotografi", "Kamera", "Tips Foto", "Editing", "Visual"],
  Musik: ["Musik", "Band", "Musisi", "Chord", "Review Musik"],
  Pertanian: ["Pertanian", "Agrikultur", "Hidroponik", "Kebun", "Peternakan"],
  iGaming: ["iGaming", "Berita Gaming", "Esports", "Platform Review", "Industry News"],
};

export interface ArticleSourceContext {
  title: string;
  content: string;
  url: string;
}

export interface GenerateArticleOptions {
  sourceContext?: ArticleSourceContext;
}

// Generate a single article using Claude.
// Backward compatible: 3rd positional arg can still be `existingTitles` (pure_ai default flow).
// New: optional 4th arg `options.sourceContext` triggers HYBRID rewrite mode.
export async function generateArticleWithClaude(
  genre: string,
  topicHint?: string,
  existingTitles?: string[],
  options?: GenerateArticleOptions,
): Promise<GeneratedArticle> {
  const topics = GENRE_TOPICS[genre] || GENRE_TOPICS["Berita"];
  const topic = topicHint || topics[Math.floor(Math.random() * topics.length)];
  const categories = CATEGORY_NAMES[genre] || CATEGORY_NAMES["Berita"];
  const category = categories[Math.floor(Math.random() * categories.length)];

  const existingTitlesHint = existingTitles && existingTitles.length > 0
    ? `\n\nJANGAN gunakan judul yang mirip dengan ini (sudah ada):\n${existingTitles.slice(-10).map(t => `- ${t}`).join("\n")}`
    : "";

  const src = options?.sourceContext;
  // Trim source content to keep prompt budget sane (~6k chars ≈ 1.5k tokens)
  const trimmedSource = src ? src.content.slice(0, 6000) : "";

  const prompt = src
    ? `Kamu adalah penulis blog Indonesia berpengalaman. Tulis ULANG artikel berikut menjadi artikel blog baru yang ORIGINAL dalam Bahasa Indonesia untuk kategori "${genre}".

SUMBER (referensi konteks, JANGAN dikutip langsung):
Judul: ${src.title}
Isi: ${trimmedSource}

ATURAN REWRITE:
1. Parafrase TOTAL — JANGAN salin kalimat, frasa, atau struktur kalimat sumber
2. Restrukturisasi alur: ubah urutan poin, gabung/pecah paragraf, tambahkan sudut pandang baru
3. JANGAN menyebut sumber, outlet berita, atau tautan asli — artikel terasa orisinal
4. JANGAN gunakan kutipan langsung ("...") dari sumber
5. Target panjang: 800-1000 kata
6. Bahasa Indonesia ALAMI, tidak kaku, sesekali santai ("kamu", "kita")
7. JANGAN mulai dengan "Dalam era..." atau "Di era modern ini..."
8. JANGAN gunakan frasa AI seperti "Penting untuk dicatat", "Perlu digarisbawahi"
9. JANGAN pakai heading "Kesimpulan" di akhir
10. Variasikan panjang paragraf, sisipkan opini personal yang autentik
${existingTitlesHint}

FORMAT OUTPUT (JSON):
{
  "title": "Judul baru yang menarik & SEO-friendly (50-70 karakter), BUKAN copy judul sumber",
  "content": "Artikel HTML (<h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>). 800-1000 kata. 3-4 H2 dan 1-2 H3.",
  "excerpt": "Ringkasan 1-2 kalimat (maksimal 160 karakter)",
  "tags": "tag1, tag2, tag3, tag4, tag5"
}

PENTING: Output HANYA JSON, tanpa markdown code block, tanpa backtick, tanpa penjelasan tambahan.`
    : `Kamu adalah penulis blog Indonesia yang berpengalaman. Tulis artikel blog dalam Bahasa Indonesia tentang topik: "${topic}" untuk kategori "${genre}".

ATURAN PENTING:
1. Tulis dalam Bahasa Indonesia yang ALAMI dan TIDAK kaku — seperti blogger sungguhan, bukan robot
2. Gunakan bahasa sehari-hari yang mudah dipahami, sesekali sisipkan kata-kata santai
3. JANGAN gunakan kata "Kesimpulan" sebagai heading terakhir
4. JANGAN mulai artikel dengan "Dalam era..." atau "Di era modern ini..."
5. JANGAN gunakan frasa AI seperti "Penting untuk dicatat", "Perlu digarisbawahi", "Mari kita telusuri"
6. Variasikan panjang paragraf — ada yang pendek (2 kalimat), ada yang panjang (4-5 kalimat)
7. Gunakan bahasa yang PERSONAL — "kamu", "gue", "kita" sesekali, tidak selalu "Anda"
8. Sisipkan pengalaman atau opini pribadi yang terasa autentik
${existingTitlesHint}

FORMAT OUTPUT (JSON):
{
  "title": "Judul artikel yang menarik dan SEO-friendly (50-70 karakter)",
  "content": "Artikel dalam format HTML (gunakan <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <blockquote>). Minimal 800 kata, maksimal 1200 kata. Sertakan 3-4 heading H2 dan 1-2 H3.",
  "excerpt": "Ringkasan 1-2 kalimat (maksimal 160 karakter)",
  "tags": "tag1, tag2, tag3, tag4, tag5 (relevan dengan topik)"
}

PENTING: Output HANYA JSON, tanpa markdown code block, tanpa backtick, tanpa penjelasan tambahan.`;

  try {
    const res = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "x-api-key": getApiKey(),
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // Fast + cheap for content generation
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${error}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    // Record API usage for cost tracking (non-blocking)
    const usage = data.usage || {};
    await recordApiUsage({
      model: "claude-haiku-4-5-20251001",
      operation: src ? "article-rewrite" : "article-generate",
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
    });

    // Parse JSON from response (handle possible markdown wrapping)
    const jsonStr = text
      .replace(/^```json?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    const article = JSON.parse(jsonStr) as {
      title: string;
      content: string;
      excerpt: string;
      tags: string;
    };

    return {
      title: article.title,
      content: article.content,
      excerpt: article.excerpt,
      tags: article.tags,
      category,
    };
  } catch (err) {
    throw new Error(`Claude generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Generate a backdate schedule: spread N articles over the past M months
export function generateBackdates(count: number, monthsBack: number = 5): Date[] {
  const now = Date.now();
  const msBack = monthsBack * 30 * 24 * 60 * 60 * 1000;
  const dates: Date[] = [];

  for (let i = 0; i < count; i++) {
    // Spread evenly with some randomness
    const position = i / count; // 0.0 to ~1.0
    const baseOffset = msBack * (1 - position); // oldest first
    // Add random jitter (±3 days)
    const jitter = (Math.random() - 0.5) * 6 * 24 * 60 * 60 * 1000;
    const timestamp = now - baseOffset + jitter;
    dates.push(new Date(Math.min(timestamp, now - 24 * 60 * 60 * 1000))); // at least 1 day ago
  }

  // Sort oldest first
  dates.sort((a, b) => a.getTime() - b.getTime());
  return dates;
}
