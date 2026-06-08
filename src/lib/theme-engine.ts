// ============================================================================
// PBN Theme Generator Engine
// Generates a 100% unique theme per domain by randomizing 17+ parameters
// and producing complete CSS. Seed-based for deterministic reproduction.
// ============================================================================

import { prisma } from "./db";
import { generateNewLayoutCss } from "./theme-layouts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GeneratedTheme {
  layoutName: string;
  cssPrefix: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  fontFamily: string;
  headingFont: string;
  borderRadius: string;
  shadowStyle: string;
  spacingScale: string;
  containerWidth: string;
  headerStyle: string;
  footerStyle: string;
  generatedCss: string;
}

interface ThemeParams {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  fontFamily: string;
  headingFont: string;
  borderRadius: string;
  shadowStyle: string;
  spacingScale: string;
  containerWidth: string;
  headerStyle: string;
  footerStyle: string;
}

interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Seeded PRNG
// ---------------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function generatePrefix(rng: () => number): string {
  // CSS class names CANNOT start with a digit — first char must be a letter
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const len = rng() > 0.5 ? 3 : 4;
  let prefix = letters[Math.floor(rng() * letters.length)]; // first char = letter
  for (let i = 1; i < len; i++) {
    prefix += chars[Math.floor(rng() * chars.length)];
  }
  return prefix;
}

// ---------------------------------------------------------------------------
// Available layouts (3 professional templates)
// ---------------------------------------------------------------------------

export const AVAILABLE_LAYOUTS: string[] = [
  "berita",   // Indonesian news magazine
  "blog",     // Lifestyle blog
  "magazine", // Entertainment magazine
];

// ---------------------------------------------------------------------------
// Color palettes (35)
// ---------------------------------------------------------------------------

const COLOR_PALETTES: ColorPalette[] = [
  { primary: "#2563eb", secondary: "#1e40af", accent: "#f59e0b", bg: "#ffffff", text: "#111827" },
  { primary: "#1d4ed8", secondary: "#1e3a8a", accent: "#ef4444", bg: "#f8fafc", text: "#0f172a" },
  { primary: "#4f46e5", secondary: "#4338ca", accent: "#06b6d4", bg: "#ffffff", text: "#1e1b4b" },
  { primary: "#0284c7", secondary: "#0369a1", accent: "#eab308", bg: "#f0f9ff", text: "#0c4a6e" },
  { primary: "#334155", secondary: "#1e293b", accent: "#3b82f6", bg: "#ffffff", text: "#0f172a" },
  { primary: "#059669", secondary: "#047857", accent: "#f97316", bg: "#f0fdf4", text: "#14532d" },
  { primary: "#16a34a", secondary: "#15803d", accent: "#d97706", bg: "#fefce8", text: "#1a2e05" },
  { primary: "#65a30d", secondary: "#4d7c0f", accent: "#e11d48", bg: "#fefdf0", text: "#1c1917" },
  { primary: "#854d0e", secondary: "#713f12", accent: "#2563eb", bg: "#fffbeb", text: "#422006" },
  { primary: "#78716c", secondary: "#57534e", accent: "#0ea5e9", bg: "#fafaf9", text: "#1c1917" },
  { primary: "#dc2626", secondary: "#991b1b", accent: "#fbbf24", bg: "#fff1f2", text: "#1c1917" },
  { primary: "#ea580c", secondary: "#c2410c", accent: "#7c3aed", bg: "#fff7ed", text: "#431407" },
  { primary: "#db2777", secondary: "#be185d", accent: "#0d9488", bg: "#fdf2f8", text: "#500724" },
  { primary: "#e11d48", secondary: "#be123c", accent: "#2dd4bf", bg: "#fff1f2", text: "#1c1917" },
  { primary: "#0891b2", secondary: "#0e7490", accent: "#f43f5e", bg: "#ecfeff", text: "#164e63" },
  { primary: "#0d9488", secondary: "#0f766e", accent: "#a855f7", bg: "#f0fdfa", text: "#134e4a" },
  { primary: "#6366f1", secondary: "#4f46e5", accent: "#f59e0b", bg: "#eef2ff", text: "#312e81" },
  { primary: "#7c3aed", secondary: "#6d28d9", accent: "#10b981", bg: "#faf5ff", text: "#1e1b4b" },
  { primary: "#a855f7", secondary: "#9333ea", accent: "#f97316", bg: "#faf5ff", text: "#3b0764" },
  { primary: "#ec4899", secondary: "#db2777", accent: "#06b6d4", bg: "#fdf2f8", text: "#831843" },
  { primary: "#8b5cf6", secondary: "#7c3aed", accent: "#f43f5e", bg: "#f5f3ff", text: "#2e1065" },
  { primary: "#6b7280", secondary: "#4b5563", accent: "#f59e0b", bg: "#f9fafb", text: "#111827" },
  { primary: "#94a3b8", secondary: "#64748b", accent: "#e11d48", bg: "#f8fafc", text: "#0f172a" },
  { primary: "#a1a1aa", secondary: "#71717a", accent: "#0ea5e9", bg: "#fafafa", text: "#18181b" },
  { primary: "#9ca3af", secondary: "#6b7280", accent: "#8b5cf6", bg: "#f3f4f6", text: "#111827" },
  { primary: "#d4d4d8", secondary: "#a1a1aa", accent: "#059669", bg: "#ffffff", text: "#27272a" },
  { primary: "#60a5fa", secondary: "#3b82f6", accent: "#fbbf24", bg: "#0f172a", text: "#e2e8f0" },
  { primary: "#34d399", secondary: "#10b981", accent: "#f472b6", bg: "#111827", text: "#d1d5db" },
  { primary: "#f472b6", secondary: "#ec4899", accent: "#34d399", bg: "#1e1b2e", text: "#e2e0f0" },
  { primary: "#a78bfa", secondary: "#8b5cf6", accent: "#fbbf24", bg: "#1a1625", text: "#e8e3f3" },
  { primary: "#38bdf8", secondary: "#0ea5e9", accent: "#fb923c", bg: "#0c1222", text: "#cbd5e1" },
  { primary: "#fb7185", secondary: "#f43f5e", accent: "#2dd4bf", bg: "#18111e", text: "#fce7f3" },
  { primary: "#4ade80", secondary: "#22c55e", accent: "#f97316", bg: "#0a1a0f", text: "#d1fae5" },
  { primary: "#fbbf24", secondary: "#f59e0b", accent: "#818cf8", bg: "#1c1308", text: "#fef3c7" },
  { primary: "#e879f9", secondary: "#d946ef", accent: "#22d3ee", bg: "#1a0a1e", text: "#f5d0fe" },
];

// ---------------------------------------------------------------------------
// Font pairings (heading + body) — 22 pairs
// ---------------------------------------------------------------------------

const FONT_PAIRINGS: [string, string][] = [
  ["Playfair Display", "Lato"],
  ["Montserrat", "Open Sans"],
  ["Roboto Slab", "Roboto"],
  ["Merriweather", "Source Sans Pro"],
  ["Oswald", "Quattrocento"],
  ["Raleway", "Merriweather"],
  ["Poppins", "Inter"],
  ["Lora", "Nunito"],
  ["Bitter", "Raleway"],
  ["PT Serif", "PT Sans"],
  ["Josefin Sans", "Lato"],
  ["Crimson Text", "Work Sans"],
  ["Libre Baskerville", "Montserrat"],
  ["DM Sans", "DM Serif Display"],
  ["Space Grotesk", "Inter"],
  ["Archivo", "Libre Franklin"],
  ["Cormorant Garamond", "Proza Libre"],
  ["Outfit", "Source Serif Pro"],
  ["Manrope", "Literata"],
  ["Sora", "Newsreader"],
  ["Vollkorn", "Fira Sans"],
  ["Rubik", "Karla"],
];

// ---------------------------------------------------------------------------
// Other parameter pools
// ---------------------------------------------------------------------------

const BORDER_RADII = ["0px", "2px", "4px", "6px", "8px", "12px", "16px", "20px", "9999px"];

const SHADOW_OPTIONS = [
  "none",
  "0 1px 2px rgba(0,0,0,0.05)",
  "0 1px 3px rgba(0,0,0,0.1)",
  "0 4px 6px rgba(0,0,0,0.07)",
  "0 10px 15px rgba(0,0,0,0.1)",
  "0 4px 6px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.1)",
  "0 20px 25px rgba(0,0,0,0.1), 0 8px 10px rgba(0,0,0,0.04)",
];

const SPACING_SCALES = ["0.75", "0.85", "1", "1.1", "1.25", "1.4"];

const CONTAINER_WIDTHS = ["900px", "960px", "1000px", "1060px", "1100px", "1140px", "1200px", "1280px"];

const HEADER_STYLES = ["centered", "left-aligned", "minimal", "full-width"];

const FOOTER_STYLES = ["simple", "detailed", "minimal", "multi-column"];

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function generateUniqueTheme(seed?: number): GeneratedTheme {
  const actualSeed = seed ?? Date.now();
  const rng = seededRandom(actualSeed);

  const layoutName = pick(AVAILABLE_LAYOUTS, rng);
  const cssPrefix = generatePrefix(rng);
  const palette = pick(COLOR_PALETTES, rng);
  const fontPair = pick(FONT_PAIRINGS, rng);
  const borderRadius = pick(BORDER_RADII, rng);
  const shadowStyle = pick(SHADOW_OPTIONS, rng);
  const spacingScale = pick(SPACING_SCALES, rng);
  const containerWidth = pick(CONTAINER_WIDTHS, rng);
  const headerStyle = pick(HEADER_STYLES, rng);
  const footerStyle = pick(FOOTER_STYLES, rng);

  const params: ThemeParams = {
    primaryColor: palette.primary,
    secondaryColor: palette.secondary,
    accentColor: palette.accent,
    bgColor: palette.bg,
    textColor: palette.text,
    fontFamily: fontPair[1],
    headingFont: fontPair[0],
    borderRadius,
    shadowStyle,
    spacingScale,
    containerWidth,
    headerStyle,
    footerStyle,
  };

  const generatedCss = generateCssForLayout(layoutName, cssPrefix, params);

  return {
    layoutName,
    cssPrefix,
    primaryColor: palette.primary,
    secondaryColor: palette.secondary,
    accentColor: palette.accent,
    bgColor: palette.bg,
    textColor: palette.text,
    fontFamily: fontPair[1],
    headingFont: fontPair[0],
    borderRadius,
    shadowStyle,
    spacingScale,
    containerWidth,
    headerStyle,
    footerStyle,
    generatedCss,
  };
}

// ---------------------------------------------------------------------------
// Genre-aware theme generation
// ---------------------------------------------------------------------------

export const GENRE_OPTIONS = [
  "Teknologi", "Kesehatan", "Keuangan", "Travel", "Makanan",
  "Fashion", "Olahraga", "Pendidikan", "Berita", "Otomotif",
  "Properti", "Hiburan", "Bisnis", "Seni & Budaya", "Lifestyle",
  "iGaming",
];

const GENRE_PALETTE_MAP: Record<string, number[]> = {
  "Teknologi": [0, 4, 8, 12, 30, 31, 32],
  "Kesehatan": [1, 5, 9, 13, 17],
  "Keuangan": [0, 3, 7, 11, 33],
  "Travel": [1, 4, 6, 10, 14],
  "Makanan": [2, 6, 10, 14, 18],
  "Fashion": [3, 7, 15, 19, 34],
  "Olahraga": [2, 6, 10, 14, 18],
  "Pendidikan": [0, 1, 5, 9, 13],
  "Berita": [0, 2, 8, 12, 30],
  "Otomotif": [3, 7, 11, 15, 31],
  "Properti": [0, 1, 5, 9, 17],
  "Hiburan": [3, 7, 19, 23, 27],
  "Bisnis": [0, 3, 8, 11, 33],
  "Seni & Budaya": [3, 7, 15, 19, 23],
  "Lifestyle": [1, 5, 9, 14, 17],
  // iGaming: dark / neon / gaming palette (vibrant purples, cyans, magenta)
  "iGaming": [19, 23, 27, 31, 34],
};

const GENRE_LAYOUT_PREFERENCES: Record<string, string[]> = {
  "Berita": ["berita"],
  "Olahraga": ["berita"],
  "Otomotif": ["berita"],
  "Hukum": ["berita"],
  "Teknologi": ["blog", "berita"],
  "Bisnis": ["blog", "berita"],
  "Keuangan": ["blog", "berita"],
  "Pendidikan": ["blog"],
  "Kesehatan": ["blog"],
  "Parenting": ["blog"],
  "Lingkungan": ["blog"],
  "Pertanian": ["blog"],
  "Hukum2": ["blog"],
  "Seni & Budaya": ["magazine"],
  "Fashion": ["magazine"],
  "Travel": ["magazine"],
  "Makanan": ["magazine"],
  "Hiburan": ["magazine"],
  "Gaming": ["magazine"],
  "Fotografi": ["magazine"],
  "Musik": ["magazine"],
  "Properti": ["blog", "magazine"],
  "iGaming": ["magazine", "blog"], // skip berita — iGaming news looks better in magazine/blog
};

export function generateUniqueThemeForGenre(genre: string, seed?: number): GeneratedTheme {
  if (!genre || !GENRE_PALETTE_MAP[genre]) {
    return generateUniqueTheme(seed);
  }

  const actualSeed = seed ?? Date.now();
  const rng = seededRandom(actualSeed);

  // Layout selection: 60% chance to use genre-preferred layout, 40% any layout
  let layoutName: string;
  const preferredLayouts = GENRE_LAYOUT_PREFERENCES[genre];
  if (preferredLayouts && rng() < 0.6) {
    layoutName = pick(preferredLayouts, rng);
  } else {
    layoutName = pick(AVAILABLE_LAYOUTS, rng);
  }

  const cssPrefix = generatePrefix(rng);

  // Palette selection: pick from genre-preferred palette indices
  const paletteIndices = GENRE_PALETTE_MAP[genre];
  const paletteIndex = pick(paletteIndices, rng);
  const palette = COLOR_PALETTES[paletteIndex];

  const fontPair = pick(FONT_PAIRINGS, rng);
  const borderRadius = pick(BORDER_RADII, rng);
  const shadowStyle = pick(SHADOW_OPTIONS, rng);
  const spacingScale = pick(SPACING_SCALES, rng);
  const containerWidth = pick(CONTAINER_WIDTHS, rng);
  const headerStyle = pick(HEADER_STYLES, rng);
  const footerStyle = pick(FOOTER_STYLES, rng);

  const params: ThemeParams = {
    primaryColor: palette.primary,
    secondaryColor: palette.secondary,
    accentColor: palette.accent,
    bgColor: palette.bg,
    textColor: palette.text,
    fontFamily: fontPair[1],
    headingFont: fontPair[0],
    borderRadius,
    shadowStyle,
    spacingScale,
    containerWidth,
    headerStyle,
    footerStyle,
  };

  const generatedCss = generateCssForLayout(layoutName, cssPrefix, params);

  return {
    layoutName,
    cssPrefix,
    primaryColor: palette.primary,
    secondaryColor: palette.secondary,
    accentColor: palette.accent,
    bgColor: palette.bg,
    textColor: palette.text,
    fontFamily: fontPair[1],
    headingFont: fontPair[0],
    borderRadius,
    shadowStyle,
    spacingScale,
    containerWidth,
    headerStyle,
    footerStyle,
    generatedCss,
  };
}

// ---------------------------------------------------------------------------
// CSS generation — uses 3 new professional templates
// ---------------------------------------------------------------------------

export function generateCssForLayout(
  layoutName: string,
  prefix: string,
  params: ThemeParams
): string {
  return generateNewLayoutCss(layoutName, prefix, params);
}

// ---------------------------------------------------------------------------
// ensureThemeForDomain — single source of truth for per-domain theme creation.
//
// Behavior:
//   1. Re-read the domain inside the function (the caller's `domain.themeId`
//      may be stale by the time this runs).
//   2. If the domain already has a theme, return its id (idempotent).
//   3. Otherwise: generate a genre-aware theme, create the Theme row, then
//      run a conditional `updateMany` on Domain with `themeId: null` as a
//      guard. If `count === 0` it means a concurrent caller already attached
//      a theme — delete our orphan theme and return the existing themeId.
//
// `source` is a short label baked into the Theme.name so we can see in the
// DB which callsite created it ("scheduler", "wp-import", "ai-bulk", ...).
// Defaults to "auto" for callers that don't care.
// ---------------------------------------------------------------------------

export async function ensureThemeForDomain(
  domainId: string,
  genre?: string | null,
  source: string = "auto",
): Promise<string> {
  // Step 1 — read current state. If theme already set, return early.
  const current = await prisma.domain.findUnique({
    where: { id: domainId },
    select: { themeId: true, genre: true },
  });
  if (!current) {
    throw new Error(`ensureThemeForDomain: domain ${domainId} not found`);
  }
  if (current.themeId) return current.themeId;

  const effectiveGenre = (genre ?? current.genre ?? "").trim() || "Berita";

  // Step 2 — generate + create the theme row.
  const fresh = generateUniqueThemeForGenre(
    effectiveGenre,
    Date.now() + Math.random() * 10000,
  );
  const theme = await prisma.theme.create({
    data: {
      name: `${source} - ${fresh.layoutName} - ${effectiveGenre} (${fresh.cssPrefix})`,
      templateName: fresh.layoutName,
      layoutName: fresh.layoutName,
      cssPrefix: fresh.cssPrefix,
      primaryColor: fresh.primaryColor,
      secondaryColor: fresh.secondaryColor,
      accentColor: fresh.accentColor,
      bgColor: fresh.bgColor,
      textColor: fresh.textColor,
      fontFamily: fresh.fontFamily,
      headingFont: fresh.headingFont,
      borderRadius: fresh.borderRadius,
      shadowStyle: fresh.shadowStyle,
      spacingScale: fresh.spacingScale,
      containerWidth: fresh.containerWidth,
      headerStyle: fresh.headerStyle,
      footerStyle: fresh.footerStyle,
      generatedCss: fresh.generatedCss,
      isGenerated: true,
    },
  });

  // Step 3 — conditional attach. updateMany lets us include `themeId: null`
  // in the WHERE clause so a racing caller can't double-attach.
  const result = await prisma.domain.updateMany({
    where: { id: domainId, themeId: null },
    data: { themeId: theme.id },
  });

  if (result.count === 0) {
    // Someone beat us to it — clean up our orphan and return the winner.
    await prisma.theme.delete({ where: { id: theme.id } }).catch(() => {});
    const winner = await prisma.domain.findUnique({
      where: { id: domainId },
      select: { themeId: true },
    });
    if (winner?.themeId) return winner.themeId;
    throw new Error(`ensureThemeForDomain: race lost but no themeId set for ${domainId}`);
  }

  return theme.id;
}
