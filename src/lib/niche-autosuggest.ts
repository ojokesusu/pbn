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

const RULES: NicheRule[] = [
  {
    niche: "finance",
    strong: /\b(finance|invest|saham|crypto|kripto|bank|loan|kredit)\b/i,
    weak: /(finance|invest|saham|crypto|kripto|bank|loan|kredit|fintech|forex|trading)/i,
    keywords: ["finance", "investasi", "saham", "crypto", "kredit", "fintech"],
  },
  {
    niche: "health",
    strong: /\b(health|kesehatan|diet|fitness|medi|dokter|obat)\b/i,
    weak: /(health|kesehatan|diet|fitness|medi|dokter|obat|klinik|herbal|farma)/i,
    keywords: ["kesehatan", "diet", "fitness", "medis", "dokter", "obat"],
  },
  {
    niche: "tech",
    strong: /\b(tech|teknologi|gadget|app|software|coding|programming)\b/i,
    weak: /(tech|teknologi|gadget|software|coding|programming|developer|digital)/i,
    keywords: ["teknologi", "gadget", "software", "coding", "developer", "digital"],
  },
  {
    niche: "business",
    strong: /\b(biz|business|usaha|startup|umkm|marketing)\b/i,
    weak: /(business|usaha|startup|umkm|marketing|bisnis|wirausaha)/i,
    keywords: ["bisnis", "usaha", "startup", "umkm", "marketing", "wirausaha"],
  },
  {
    niche: "education",
    strong: /\b(edu|education|sekolah|kampus|kuliah|belajar)\b/i,
    weak: /(education|sekolah|kampus|kuliah|belajar|pendidikan|akademi|skripsi)/i,
    keywords: ["pendidikan", "sekolah", "kampus", "kuliah", "belajar", "akademi"],
  },
  {
    niche: "travel",
    strong: /\b(travel|wisata|tour|hotel|destinasi)\b/i,
    weak: /(travel|wisata|tour|hotel|destinasi|liburan|holiday)/i,
    keywords: ["travel", "wisata", "tour", "hotel", "destinasi", "liburan"],
  },
  {
    niche: "food",
    strong: /\b(food|kuliner|recipe|resep|masak)\b/i,
    weak: /(food|kuliner|recipe|resep|masak|kafe|restoran)/i,
    keywords: ["kuliner", "resep", "masakan", "food", "kafe", "restoran"],
  },
  {
    niche: "sport",
    // `fitness` shows up here too on purpose — health takes it first because
    // it's earlier in the list, but if a URL has "bola" or "sport" we'd
    // never reach this anyway. Kept for symmetry with the spec.
    strong: /\b(sport|olahraga|bola|fitness)\b/i,
    weak: /(sport|olahraga|bola|fitness|sepakbola|atletik)/i,
    keywords: ["olahraga", "sport", "sepakbola", "atletik", "fitness", "kebugaran"],
  },
];

// Generic "lifestyle" bucket — broad enough that bulk content gen still has
// something to hang a prompt on, but flagged as low confidence so the
// dashboard can surface "review me" affordances later.
const FALLBACK: NicheSuggestion = {
  niche: "lifestyle",
  confidence: "low",
  keywords: ["lifestyle", "gaya hidup", "tips", "info", "berita", "umum"],
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
  "finance",
  "health",
  "tech",
  "business",
  "education",
  "travel",
  "food",
  "sport",
  "lifestyle",
] as const;
export type Niche = (typeof NICHE_LIST)[number];
