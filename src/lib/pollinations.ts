// ── Pollinations.ai image generator client ──
// Free, no-API-key image generator powered by Flux.
// Returns a direct URL that the browser/CDN fetches on demand — we don't
// download the file ourselves, keeping storage local.
//
// Docs: https://pollinations.ai/ (GET https://image.pollinations.ai/prompt/{text})

const BASE = "https://image.pollinations.ai/prompt";

// Short English visual descriptors per genre for better Flux output.
// iGaming uses neutral/SFW gaming + tournament aesthetic — no gambling imagery.
const GENRE_VISUAL_HINTS: Record<string, string> = {
  iGaming:
    "cinematic gaming arena, esports tournament stage, neon purple and cyan lighting, professional gaming setup, high detail, 4k",
  Teknologi: "modern tech, minimalist, clean desk, laptop, blue tones",
  Gaming: "gaming setup, RGB lights, modern, vivid",
  Travel: "scenic landscape, golden hour, travel photography",
  Kuliner: "food photography, top-down, natural light",
  Bisnis: "corporate, modern office, professional",
  Olahraga: "sports action shot, dynamic, stadium",
  Fashion: "fashion editorial, studio lighting",
  Musik: "music concert, stage lights, cinematic",
  Hiburan: "cinematic, dramatic lighting, vibrant",
};

export interface PollinationsOptions {
  width?: number;
  height?: number;
  seed?: number;
  nologo?: boolean;
  enhance?: boolean;
  model?: "flux" | "turbo";
}

// Build a Pollinations image URL. The URL itself is the image — no fetch needed.
export function pollinationsImageUrl(
  prompt: string,
  opts: PollinationsOptions = {}
): string {
  const {
    width = 1200,
    height = 630,
    seed = Math.floor(Math.random() * 1_000_000),
    nologo = true,
    enhance = true,
    model = "flux",
  } = opts;

  const encoded = encodeURIComponent(prompt.trim());
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    model,
  });
  if (nologo) params.set("nologo", "true");
  if (enhance) params.set("enhance", "true");

  return `${BASE}/${encoded}?${params.toString()}`;
}

// Generate a Pollinations URL from a genre + optional article title.
// Used by the scheduler as an alternative to Pexels for variation.
export function pollinationsFromGenre(
  genre: string,
  title?: string,
  opts: PollinationsOptions = {}
): string {
  const hint = GENRE_VISUAL_HINTS[genre] || "professional photo, high detail";
  const subject = title ? title.slice(0, 80) : genre;
  const prompt = `${subject}, ${hint}`;
  return pollinationsImageUrl(prompt, opts);
}
