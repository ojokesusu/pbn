// Rule-based niche auto-suggest. No AI, no network — pure regex over the
// domain URL/name so we can run it against 1k+ rows in a single request
// without spending tokens. First matching rule wins; order matters.
//
// Used by /api/content/niche-mapping/auto-suggest to bulk-fill the
// NicheMapping table for domains Sandi never manually classified.

export type NicheSuggestion = {
  niche: string;
  confidence: "high" | "medium" | "low";
  keywords: string[];
};

// Minimum shape we need from a Domain row. Keeping it loose so callers can
// pass the full Prisma model or a slim {id, url, name} projection.
export type NicheInput = {
  url: string;
  name?: string | null;
  genre?: string | null;
};

// Each rule pairs a strong-signal regex (full keyword match → high confidence)
// with a weaker "contains" fallback (substring within a longer token → medium).
// `keywords` is what gets persisted onto NicheMapping for downstream content
// gen prompts — keep it focused, ~6 terms, mix EN+ID.
type NicheRule = {
  niche: string;
  // Word-ish boundaries so "finance" hits "myfinance.com" but "ance" alone doesn't.
  strong: RegExp;
  // Looser substring fallback, used only when strong miss.
  weak: RegExp;
  keywords: string[];
};

// Order matters: more specific niches MUST come before more general ones.
// e.g. 'kriminal' before 'news', 'bola' before 'sport', 'film' before 'hiburan'.
const RULES: NicheRule[] = [
  // ---------- NEWS CLUSTER (specific → general) ----------
  {
    niche: "politik",
    strong: /\b(politik|pilpres|pilkada|partai|dpr|kabinet|presiden|gubernur|menteri)\b/i,
    weak: /(politik|pilpres|pilkada|partai|kabinet|presiden|gubernur|menteri|politics)/i,
    keywords: ["politik", "pilpres", "pilkada", "partai", "dpr", "presiden", "menteri"],
  },
  {
    niche: "kriminal",
    strong: /\b(kriminal|kepolisian|narkoba|pembunuhan|perampokan|pencurian|kriminalitas)\b/i,
    weak: /(kriminal|polisi|narkoba|pembunuhan|perampokan|pencurian|kasus|crime)/i,
    keywords: ["kriminal", "kepolisian", "narkoba", "kasus", "pencurian", "crime"],
  },
  {
    niche: "hukum",
    strong: /\b(hukum|pengadilan|putusan|vonis|jaksa|hakim|ruu|mahkamah)\b/i,
    weak: /(hukum|pengadilan|putusan|vonis|jaksa|hakim|mahkamah|legal|law)/i,
    keywords: ["hukum", "pengadilan", "vonis", "jaksa", "hakim", "mahkamah", "law"],
  },
  {
    niche: "ekonomi",
    strong: /\b(ekonomi|makroekonomi|inflasi|rupiah|apbn|bursa|makro)\b/i,
    weak: /(ekonomi|inflasi|rupiah|apbn|bursa|makro|economy|economic)/i,
    keywords: ["ekonomi", "inflasi", "rupiah", "apbn", "bursa", "makro", "economy"],
  },
  {
    niche: "internasional",
    strong: /\b(internasional|international|pbb|asean|washington|beijing|world|global)\b/i,
    weak: /(internasional|international|pbb|asean|washington|beijing|world|global|luarnegeri)/i,
    keywords: ["internasional", "international", "world", "pbb", "asean", "global"],
  },
  {
    niche: "bencana",
    strong: /\b(gempa|banjir|kebakaran|tsunami|longsor|bencana|bmkg)\b/i,
    weak: /(gempa|banjir|kebakaran|tsunami|longsor|bencana|bmkg|disaster)/i,
    keywords: ["bencana", "gempa", "banjir", "tsunami", "bmkg", "kebakaran"],
  },
  {
    niche: "news",
    strong: /\b(news|berita|kabar|peristiwa|viral|nasional)\b/i,
    weak: /(news|berita|kabar|peristiwa|viral|nasional|info|harian)/i,
    keywords: ["news", "berita", "peristiwa", "kabar", "info", "umum"],
  },

  // ---------- HIBURAN CLUSTER (specific → general) ----------
  {
    niche: "musik",
    strong: /\b(musik|music|lagu|konser|album|billboard|spotify)\b/i,
    weak: /(musik|music|lagu|konser|album|billboard|spotify|musisi|band)/i,
    keywords: ["musik", "music", "lagu", "konser", "album", "spotify"],
  },
  {
    niche: "film",
    strong: /\b(film|movie|bioskop|cinema|sutradara|premiere)\b/i,
    weak: /(film|movie|bioskop|cinema|sutradara|premiere|sinema)/i,
    keywords: ["film", "movie", "bioskop", "cinema", "sutradara", "premiere"],
  },
  {
    niche: "igaming",
    // iGaming = online gambling, casino, slot, betting, poker, sportsbook.
    // Listed BEFORE 'gaming' so domains like "slotgacor.com" / "casino-vip.id"
    // bucket here instead of regular esports gaming. Pollinations is allowed
    // ONLY for this niche (Sandi rule [[feedback-pollinations-igaming-only]]).
    strong: /\b(igaming|casino|slot|judi|taruhan|betting|poker|sportsbook|gacor|gambling|togel|bandar)\b/i,
    weak: /(igaming|casino|slot|judi|taruhan|betting|poker|sportsbook|gacor|gambling|togel|bandar|jackpot|rolet|baccarat)/i,
    keywords: ["igaming", "casino", "slot", "judi online", "taruhan", "betting"],
  },
  {
    niche: "gaming",
    strong: /\b(gaming|game|esports|mobilelegend|pubg|freefire|dota|valorant)\b/i,
    weak: /(gaming|game|esports|mobilelegend|pubg|freefire|dota|valorant|gamer)/i,
    keywords: ["gaming", "game", "esports", "mobile legend", "pubg", "dota"],
  },
  {
    niche: "tv",
    strong: /\b(sinetron|drakor|serial|episode|anime|drama)\b/i,
    weak: /(sinetron|drakor|serial|episode|anime|drama|korea|netflix)/i,
    keywords: ["sinetron", "drakor", "serial", "anime", "drama korea", "episode"],
  },
  {
    niche: "hiburan",
    strong: /\b(hiburan|selebriti|gosip|infotainment|artis|seleb|celebrity)\b/i,
    weak: /(hiburan|selebriti|gosip|infotainment|artis|seleb|celebrity|entertainment)/i,
    keywords: ["hiburan", "selebriti", "gosip", "artis", "infotainment", "entertainment"],
  },

  // ---------- OTOMOTIF / SPORT CLUSTER (specific → general) ----------
  {
    niche: "balap",
    strong: /\b(motogp|formula1|f1|balap|racing|rossi|marquez|valentino)\b/i,
    weak: /(motogp|formula1|balap|racing|rossi|marquez|valentino|race)/i,
    keywords: ["motogp", "f1", "balap", "racing", "marquez", "rossi"],
  },
  {
    niche: "otomotif",
    strong: /\b(mobil|motor|otomotif|automotive|modifikasi)\b/i,
    weak: /(mobil|motor|otomotif|automotive|modifikasi|kendaraan|auto)/i,
    keywords: ["mobil", "motor", "otomotif", "automotive", "modifikasi", "review mobil"],
  },
  {
    niche: "bola",
    strong: /\b(bola|sepakbola|liga1|persija|persib|timnas|epl|liverpool|mu)\b/i,
    weak: /(bola|sepakbola|liga1|persija|persib|timnas|epl|liverpool|football|soccer)/i,
    keywords: ["bola", "sepakbola", "liga 1", "timnas", "epl", "liverpool"],
  },
  {
    niche: "sport",
    strong: /\b(sport|olahraga|atletik|badminton|tinju|fitness)\b/i,
    weak: /(sport|olahraga|atletik|badminton|tinju|fitness|kebugaran)/i,
    keywords: ["olahraga", "sport", "atletik", "badminton", "tinju", "fitness"],
  },

  // ---------- LIFE / SOCIETY (specific) ----------
  {
    niche: "properti",
    strong: /\b(properti|property|rumah|kpr|apartemen|kontrakan)\b/i,
    weak: /(properti|property|rumah|kpr|apartemen|kontrakan|realestate|estate)/i,
    keywords: ["properti", "real estate", "rumah", "kpr", "apartemen", "kontrakan"],
  },
  {
    niche: "karir",
    strong: /\b(karir|karier|lowongan|kerja|gaji|interview|cv|hrd)\b/i,
    weak: /(karir|karier|lowongan|kerja|gaji|interview|hrd|career|job)/i,
    keywords: ["karir", "lowongan", "kerja", "gaji", "interview", "cv", "hrd"],
  },
  {
    niche: "parenting",
    strong: /\b(parenting|anak|ibu|ayah|hamil|mpasi|tumbuhkembang)\b/i,
    weak: /(parenting|anak|ibu|ayah|hamil|mpasi|tumbuhkembang|balita|bayi)/i,
    keywords: ["parenting", "anak", "ibu", "hamil", "mpasi", "tumbuh kembang"],
  },
  {
    niche: "fashion",
    strong: /\b(fashion|outfit|mode|busana|hijab)\b/i,
    weak: /(fashion|outfit|mode|busana|hijab|trend|style)/i,
    keywords: ["fashion", "outfit", "busana", "hijab", "mode", "trend"],
  },
  {
    niche: "beauty",
    strong: /\b(beauty|skincare|makeup|kosmetik|kecantikan|parfum)\b/i,
    weak: /(beauty|skincare|makeup|kosmetik|kecantikan|parfum|cosmetic)/i,
    keywords: ["beauty", "skincare", "makeup", "kosmetik", "kecantikan", "parfum"],
  },
  {
    niche: "religion",
    strong: /\b(islam|ramadan|doa|dakwah|ustadz|masjid|quran|kajian)\b/i,
    weak: /(islam|ramadan|doa|dakwah|ustadz|masjid|quran|kajian|religi|muslim)/i,
    keywords: ["islam", "ramadan", "doa", "dakwah", "masjid", "qur'an", "kajian"],
  },
  {
    niche: "science",
    strong: /\b(science|sains|riset|penelitian|ilmiah|fisika|kimia)\b/i,
    weak: /(science|sains|riset|penelitian|ilmiah|fisika|kimia|biologi|scientific)/i,
    keywords: ["science", "sains", "riset", "penelitian", "ilmiah", "fisika", "kimia"],
  },
  {
    niche: "agrikultur",
    strong: /\b(pertanian|agrikultur|petani|padi|sawit|kebun|peternakan|agriculture)\b/i,
    weak: /(pertanian|agrikultur|petani|padi|sawit|kebun|peternakan|agriculture|tani)/i,
    keywords: ["pertanian", "agrikultur", "petani", "padi", "sawit", "peternakan"],
  },
  {
    niche: "militer",
    strong: /\b(tni|militer|kopassus|marinir|alutsista|jenderal|military)\b/i,
    weak: /(tni|militer|kopassus|marinir|alutsista|jenderal|military|tentara)/i,
    keywords: ["tni", "militer", "kopassus", "marinir", "alutsista", "jenderal"],
  },

  // ---------- GENERIC EVERGREEN (broad — must stay near the bottom) ----------
  {
    niche: "tech",
    strong: /\b(tech|teknologi|gadget|app|software|coding|developer)\b/i,
    weak: /(tech|teknologi|gadget|software|coding|developer|digital|programming)/i,
    keywords: ["tech", "teknologi", "gadget", "software", "coding", "developer"],
  },
  {
    niche: "finance",
    // 'bank' moved to weak-only: too generic as a strong word-boundary token
    // (would catch "skybank.id", "banking-app.com" as finance even though
    // they're not). Strong keeps only unambiguous finance vocab.
    strong: /\b(finance|invest|saham|crypto|kripto|kredit|fintech|forex)\b/i,
    weak: /(finance|invest|saham|crypto|kripto|bank|kredit|fintech|forex|trading|loan)/i,
    keywords: ["finance", "investasi", "saham", "crypto", "kredit", "fintech", "forex"],
  },
  {
    niche: "health",
    strong: /\b(health|kesehatan|diet|fitness|medi|dokter|obat|klinik)\b/i,
    weak: /(health|kesehatan|diet|fitness|medi|dokter|obat|klinik|herbal|farma)/i,
    keywords: ["health", "kesehatan", "diet", "dokter", "obat", "klinik"],
  },
  {
    niche: "business",
    strong: /\b(business|biz|usaha|startup|umkm|marketing|wirausaha)\b/i,
    weak: /(business|usaha|startup|umkm|marketing|wirausaha|bisnis)/i,
    keywords: ["business", "usaha", "startup", "umkm", "marketing", "wirausaha"],
  },
  {
    niche: "education",
    strong: /\b(education|edu|sekolah|kampus|kuliah|belajar|pendidikan)\b/i,
    weak: /(education|sekolah|kampus|kuliah|belajar|pendidikan|akademi|skripsi)/i,
    keywords: ["education", "pendidikan", "sekolah", "kampus", "kuliah", "belajar"],
  },
  {
    niche: "travel",
    strong: /\b(travel|wisata|tour|hotel|destinasi|liburan)\b/i,
    weak: /(travel|wisata|tour|hotel|destinasi|liburan|holiday|trip)/i,
    keywords: ["travel", "wisata", "tour", "hotel", "destinasi", "liburan"],
  },
  {
    niche: "food",
    strong: /\b(food|kuliner|recipe|resep|masak|restoran)\b/i,
    weak: /(food|kuliner|recipe|resep|masak|restoran|kafe|cafe)/i,
    keywords: ["food", "kuliner", "resep", "masak", "restoran", "kafe"],
  },
  {
    niche: "lifestyle",
    strong: /\b(lifestyle|gayahidup|tips|hobi)\b/i,
    weak: /(lifestyle|gayahidup|tips|hobi|gaya hidup)/i,
    keywords: ["lifestyle", "gaya hidup", "tips", "hobi"],
  },
];

// Fallback flipped from 'lifestyle' → 'news'. News (politik/nasional/peristiwa
// umum) is the Indonesian default bucket — most unclassified PBN domains end
// up parking on general berita content anyway, so the prompts compose better.
const FALLBACK: NicheSuggestion = {
  niche: "news",
  confidence: "low",
  keywords: ["news", "berita", "peristiwa", "kabar", "info", "umum"],
};

// Strip protocol / path / TLD so the matcher sees just the brand-ish slug.
// e.g. "https://Invest-Saham.id/blog" → "invest saham". Hyphens become
// spaces so `\b` in the rules treats them as token separators.
function normalizeHaystack(input: NicheInput): string {
  const raw = `${input.url || ""} ${input.name || ""} ${input.genre || ""}`.toLowerCase();
  return raw
    .replace(/^https?:\/\//g, "")
    .replace(/^www\./g, "")
    .replace(/\.[a-z.]{2,}(\/|$)/g, " ") // drop TLDs like .com, .co.id
    .replace(/[-_/.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectNiche(domain: NicheInput): NicheSuggestion {
  if (!domain || !domain.url) return { ...FALLBACK };

  const haystack = normalizeHaystack(domain);

  for (const rule of RULES) {
    if (rule.strong.test(haystack)) {
      return {
        niche: rule.niche,
        confidence: "high",
        keywords: [...rule.keywords],
      };
    }
  }

  // Second pass with the looser regex — catches things like "myfinancehub"
  // where the token isn't a clean word boundary but the niche is obvious.
  for (const rule of RULES) {
    if (rule.weak.test(haystack)) {
      return {
        niche: rule.niche,
        confidence: "medium",
        keywords: [...rule.keywords],
      };
    }
  }

  return { ...FALLBACK };
}

// Convenience helper for callers that want to know which rule fired
// (e.g. unit tests, debug UIs). Returns null on fallback.
export function detectNicheVerbose(domain: NicheInput): NicheSuggestion | null {
  const result = detectNiche(domain);
  return result.confidence === "low" ? null : result;
}

export const NICHE_LIST = [
  "politik",
  "kriminal",
  "hukum",
  "ekonomi",
  "internasional",
  "bencana",
  "news",
  "hiburan",
  "musik",
  "film",
  "igaming",
  "gaming",
  "tv",
  "otomotif",
  "balap",
  "bola",
  "sport",
  "properti",
  "karir",
  "parenting",
  "fashion",
  "beauty",
  "religion",
  "science",
  "agrikultur",
  "militer",
  "tech",
  "finance",
  "health",
  "business",
  "education",
  "travel",
  "food",
  "lifestyle",
] as const;
export type Niche = (typeof NICHE_LIST)[number];
