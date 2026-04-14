// ── New professional layout CSS generator ──
// 3 polished templates: berita (news), blog (lifestyle), magazine (entertainment)
// All use clean, professional design patterns

interface LayoutParams {
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
}

// New layouts available
export const NEW_LAYOUTS = ["berita", "blog", "magazine"] as const;
export type LayoutName = typeof NEW_LAYOUTS[number];

export function getNewBodyClass(): string {
  return "body";
}

// Generate CSS for any of the 3 new layouts
export function generateNewLayoutCss(
  layoutName: string,
  prefix: string,
  params: LayoutParams
): string {
  const p = prefix;

  // Common base CSS for all 3 templates
  const base = `
/* === ${layoutName.toUpperCase()} Template === */
:root {
  --${p}-primary: ${params.primaryColor};
  --${p}-secondary: ${params.secondaryColor};
  --${p}-accent: ${params.accentColor};
  --${p}-bg: ${params.bgColor};
  --${p}-text: ${params.textColor};
  --${p}-text-muted: ${addAlpha(params.textColor, 0.65)};
  --${p}-text-light: ${addAlpha(params.textColor, 0.45)};
  --${p}-border: ${addAlpha(params.textColor, 0.1)};
  --${p}-border-light: ${addAlpha(params.textColor, 0.06)};
  --${p}-surface: ${lighten(params.bgColor, 0.02)};
  --${p}-radius: ${params.borderRadius};
  --${p}-radius-sm: ${reduceRadius(params.borderRadius)};
  --${p}-shadow: ${params.shadowStyle};
  --${p}-shadow-hover: 0 10px 25px -5px ${addAlpha(params.primaryColor, 0.15)};
  --${p}-container: ${params.containerWidth};
  --${p}-font: '${params.fontFamily}', -apple-system, system-ui, sans-serif;
  --${p}-heading: '${params.headingFont}', Georgia, serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.${p}-body {
  font-family: var(--${p}-font);
  font-size: 16px;
  line-height: 1.65;
  color: var(--${p}-text);
  background: var(--${p}-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.${p}-body img { max-width: 100%; height: auto; }
.${p}-body a { color: inherit; text-decoration: none; transition: color .2s ease; }

.${p}-container {
  max-width: var(--${p}-container);
  margin: 0 auto;
  padding: 0 24px;
  width: 100%;
}

/* === Top utility bar === */
.${p}-topbar {
  background: var(--${p}-text);
  color: var(--${p}-bg);
  padding: 8px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--${p}-border);
}
.${p}-topbar-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.${p}-topbar-date { opacity: .85; text-transform: capitalize; }
.${p}-topbar-tagline { opacity: .65; font-style: italic; }

/* === Main header === */
.${p}-header {
  background: var(--${p}-bg);
  padding: 28px 0 24px;
  border-bottom: 1px solid var(--${p}-border-light);
}
.${p}-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
}
.${p}-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.${p}-brand-text {
  font-family: var(--${p}-heading);
  font-size: 32px;
  font-weight: 800;
  color: var(--${p}-primary);
  line-height: 1;
  letter-spacing: -0.5px;
}
.${p}-header-meta { text-align: right; max-width: 60%; }
.${p}-tagline {
  font-size: 13px;
  color: var(--${p}-text-muted);
  font-style: italic;
}

/* === Navigation === */
.${p}-nav {
  background: var(--${p}-primary);
  border-bottom: 3px solid var(--${p}-secondary);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0,0,0,.08);
}
.${p}-nav-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
.${p}-nav .${p}-nav-link {
  display: inline-block;
  padding: 14px 18px;
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  transition: background .2s ease;
  border-right: 1px solid rgba(255,255,255,.12);
}
.${p}-nav .${p}-nav-link:hover {
  background: rgba(255,255,255,.12);
  color: #fff;
}
.${p}-nav .${p}-nav-active {
  background: var(--${p}-secondary);
  color: #fff;
}

/* === Main content area === */
.${p}-main {
  padding: 36px 0 48px;
  min-height: 60vh;
}

/* === Breadcrumb === */
.${p}-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--${p}-text-muted);
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.${p}-breadcrumb a { color: var(--${p}-primary); }
.${p}-breadcrumb a:hover { text-decoration: underline; }

/* === Section headers === */
.${p}-section-header {
  margin: 36px 0 24px;
  position: relative;
}
.${p}-section-title {
  font-family: var(--${p}-heading);
  font-size: 28px;
  font-weight: 800;
  color: var(--${p}-text);
  margin-bottom: 8px;
  display: inline-block;
  padding-right: 16px;
  background: var(--${p}-bg);
  position: relative;
  z-index: 1;
}
.${p}-section-desc {
  font-size: 14px;
  color: var(--${p}-text-muted);
  margin-bottom: 12px;
}
.${p}-section-line {
  position: absolute;
  bottom: 16px;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--${p}-primary);
  z-index: 0;
}

/* === Badges === */
.${p}-badge {
  display: inline-block;
  background: var(--${p}-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 10px;
  border-radius: var(--${p}-radius-sm);
  margin-bottom: 12px;
}
.${p}-badge-sm {
  font-size: 10px;
  padding: 3px 8px;
  margin-bottom: 6px;
}

/* === Hero section === */
.${p}-hero {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
  margin-bottom: 48px;
}
.${p}-hero-main {
  display: block;
  position: relative;
  border-radius: var(--${p}-radius);
  overflow: hidden;
  box-shadow: var(--${p}-shadow);
  background: var(--${p}-surface);
  transition: transform .3s ease, box-shadow .3s ease;
}
.${p}-hero-main:hover {
  transform: translateY(-3px);
  box-shadow: var(--${p}-shadow-hover);
}
.${p}-hero-image {
  position: relative;
  aspect-ratio: 16/10;
  overflow: hidden;
  background: var(--${p}-border-light);
}
.${p}-hero-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .5s ease;
}
.${p}-hero-main:hover .${p}-hero-image img { transform: scale(1.05); }
.${p}-hero-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--${p}-primary), var(--${p}-secondary));
}
.${p}-hero-content {
  padding: 24px 28px 28px;
}
.${p}-hero-title {
  font-family: var(--${p}-heading);
  font-size: 28px;
  font-weight: 800;
  line-height: 1.2;
  color: var(--${p}-text);
  margin-bottom: 12px;
}
.${p}-hero-excerpt {
  font-size: 15px;
  line-height: 1.6;
  color: var(--${p}-text-muted);
  margin-bottom: 16px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.${p}-hero-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.${p}-hero-secondary {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-radius: var(--${p}-radius);
  overflow: hidden;
  background: var(--${p}-surface);
  box-shadow: var(--${p}-shadow);
  flex: 1;
  transition: transform .3s ease;
}
.${p}-hero-secondary:hover { transform: translateY(-2px); }
.${p}-hero-secondary-image {
  aspect-ratio: 16/10;
  overflow: hidden;
  background: var(--${p}-border-light);
}
.${p}-hero-secondary-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.${p}-hero-secondary-content {
  padding: 0 16px 16px;
}
.${p}-hero-secondary-title {
  font-family: var(--${p}-heading);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--${p}-text);
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* === Meta info === */
.${p}-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--${p}-text-light);
}
.${p}-meta-author { font-weight: 600; color: var(--${p}-primary); }
.${p}-meta-date { color: var(--${p}-text-light); }
.${p}-meta-sep { color: var(--${p}-text-light); }

/* === Card grid === */
.${p}-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
.${p}-card {
  background: var(--${p}-surface);
  border-radius: var(--${p}-radius);
  overflow: hidden;
  box-shadow: var(--${p}-shadow);
  display: flex;
  flex-direction: column;
  transition: transform .3s ease, box-shadow .3s ease;
}
.${p}-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--${p}-shadow-hover);
}
.${p}-card-image {
  display: block;
  position: relative;
  aspect-ratio: 16/10;
  overflow: hidden;
  background: var(--${p}-border-light);
}
.${p}-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform .4s ease;
}
.${p}-card:hover .${p}-card-image img { transform: scale(1.05); }
.${p}-card-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--${p}-primary), var(--${p}-secondary));
}
.${p}-card-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  background: var(--${p}-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 10px;
  border-radius: var(--${p}-radius-sm);
  z-index: 2;
}
.${p}-card-body {
  padding: 18px 20px 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
}
.${p}-card-title {
  font-family: var(--${p}-heading);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
  margin-bottom: 10px;
}
.${p}-card-title a { color: var(--${p}-text); }
.${p}-card-title a:hover { color: var(--${p}-primary); }
.${p}-card-excerpt {
  font-size: 13px;
  line-height: 1.55;
  color: var(--${p}-text-muted);
  margin-bottom: 14px;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.${p}-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--${p}-text-light);
  padding-top: 12px;
  border-top: 1px solid var(--${p}-border-light);
}

/* === Article page === */
.${p}-article {
  max-width: 760px;
  margin: 0 auto;
}
.${p}-article-header {
  margin-bottom: 32px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--${p}-border-light);
}
.${p}-article-title {
  font-family: var(--${p}-heading);
  font-size: 40px;
  font-weight: 800;
  line-height: 1.15;
  color: var(--${p}-text);
  margin: 12px 0 16px;
}
.${p}-article-excerpt {
  font-size: 18px;
  line-height: 1.55;
  color: var(--${p}-text-muted);
  margin-bottom: 24px;
  font-style: italic;
}
.${p}-article-meta {
  margin-top: 20px;
}
.${p}-author {
  display: flex;
  align-items: center;
  gap: 12px;
}
.${p}-author-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--${p}-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  font-family: var(--${p}-heading);
}
.${p}-author-info {
  display: flex;
  flex-direction: column;
}
.${p}-author-name {
  font-weight: 700;
  font-size: 14px;
  color: var(--${p}-text);
}
.${p}-author-date {
  font-size: 12px;
  color: var(--${p}-text-light);
}
.${p}-article-hero {
  margin-bottom: 32px;
  border-radius: var(--${p}-radius);
  overflow: hidden;
  box-shadow: var(--${p}-shadow);
}
.${p}-article-hero img {
  width: 100%;
  height: auto;
  display: block;
}
.${p}-article-body {
  font-size: 17px;
  line-height: 1.8;
  color: var(--${p}-text);
}
.${p}-article-body h1, .${p}-article-body h2, .${p}-article-body h3, .${p}-article-body h4 {
  font-family: var(--${p}-heading);
  font-weight: 700;
  margin: 32px 0 16px;
  line-height: 1.3;
}
.${p}-article-body h2 { font-size: 28px; }
.${p}-article-body h3 { font-size: 22px; }
.${p}-article-body h4 { font-size: 18px; }
.${p}-article-body p { margin-bottom: 20px; }
.${p}-article-body img {
  border-radius: var(--${p}-radius-sm);
  margin: 24px 0;
}
.${p}-article-body a {
  color: var(--${p}-primary);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}
.${p}-article-body ul, .${p}-article-body ol {
  margin-bottom: 20px;
  padding-left: 24px;
}
.${p}-article-body li { margin-bottom: 8px; }
.${p}-article-body blockquote {
  border-left: 4px solid var(--${p}-primary);
  padding: 12px 20px;
  margin: 24px 0;
  font-style: italic;
  color: var(--${p}-text-muted);
  background: var(--${p}-surface);
}
.${p}-article-body strong { font-weight: 700; }

/* === Tags === */
.${p}-tags {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--${p}-border-light);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.${p}-tags-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--${p}-text-muted);
  margin-right: 4px;
}
.${p}-tag {
  display: inline-block;
  background: var(--${p}-surface);
  color: var(--${p}-text-muted);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: var(--${p}-radius-sm);
  border: 1px solid var(--${p}-border);
}

/* === Comments === */
.${p}-comments {
  max-width: 760px;
  margin: 48px auto 0;
  padding-top: 32px;
  border-top: 2px solid var(--${p}-border-light);
}
.${p}-comments-title {
  font-family: var(--${p}-heading);
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 24px;
  color: var(--${p}-text);
}
.${p}-comment {
  display: flex;
  gap: 14px;
  padding: 18px 0;
  border-bottom: 1px solid var(--${p}-border-light);
}
.${p}-comment:last-child { border-bottom: none; }
.${p}-comment-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--${p}-secondary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 16px;
  flex-shrink: 0;
}
.${p}-comment-body { flex: 1; }
.${p}-comment-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.${p}-comment-author { font-weight: 700; font-size: 14px; color: var(--${p}-text); }
.${p}-comment-date { font-size: 12px; color: var(--${p}-text-light); }
.${p}-comment-text { font-size: 14px; line-height: 1.6; color: var(--${p}-text-muted); }

/* === Footer === */
.${p}-footer {
  background: var(--${p}-text);
  color: var(--${p}-bg);
  padding: 48px 0 24px;
  margin-top: 64px;
}
.${p}-footer-inner {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 40px;
  margin-bottom: 32px;
}
.${p}-footer-title {
  font-family: var(--${p}-heading);
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 14px;
  color: var(--${p}-bg);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.${p}-footer-desc {
  font-size: 13px;
  line-height: 1.65;
  opacity: .65;
  max-width: 320px;
}
.${p}-footer-list {
  list-style: none;
  padding: 0;
}
.${p}-footer-list li { margin-bottom: 8px; }
.${p}-footer-list a {
  font-size: 13px;
  opacity: .65;
  transition: opacity .2s;
}
.${p}-footer-list a:hover { opacity: 1; color: var(--${p}-bg); }
.${p}-footer-bottom {
  padding-top: 20px;
  border-top: 1px solid rgba(255,255,255,.1);
  text-align: center;
  font-size: 12px;
  opacity: .5;
}

.${p}-empty {
  text-align: center;
  padding: 64px 0;
  color: var(--${p}-text-light);
}

/* === Responsive === */
@media (max-width: 900px) {
  .${p}-hero { grid-template-columns: 1fr; }
  .${p}-hero-side { flex-direction: row; }
  .${p}-grid { grid-template-columns: repeat(2, 1fr); }
  .${p}-footer-inner { grid-template-columns: 1fr 1fr; }
  .${p}-article-title { font-size: 32px; }
  .${p}-brand-text { font-size: 26px; }
  .${p}-header-meta { display: none; }
}
@media (max-width: 600px) {
  .${p}-grid { grid-template-columns: 1fr; }
  .${p}-hero-side { flex-direction: column; }
  .${p}-footer-inner { grid-template-columns: 1fr; }
  .${p}-article-title { font-size: 26px; }
  .${p}-nav .${p}-nav-link { padding: 12px 14px; font-size: 13px; }
  .${p}-section-title { font-size: 22px; }
  .${p}-hero-title { font-size: 22px; }
}
`;

  // Layout-specific tweaks
  let variant = "";
  if (layoutName === "blog") {
    // Blog: more spacious, single column friendly, softer
    variant = `
/* Blog variant */
.${p}-grid { grid-template-columns: repeat(2, 1fr); gap: 32px; }
.${p}-card { box-shadow: 0 1px 3px rgba(0,0,0,.05); border: 1px solid var(--${p}-border-light); }
.${p}-nav { background: var(--${p}-bg); border-bottom: 1px solid var(--${p}-border); }
.${p}-nav .${p}-nav-link { color: var(--${p}-text); border-right: none; padding: 16px 20px; }
.${p}-nav .${p}-nav-link:hover { background: var(--${p}-surface); color: var(--${p}-primary); }
.${p}-nav .${p}-nav-active { background: var(--${p}-surface); color: var(--${p}-primary); border-bottom: 3px solid var(--${p}-primary); margin-bottom: -3px; }
.${p}-hero { grid-template-columns: 1fr; }
.${p}-hero-side { flex-direction: row; }
.${p}-section-line { display: none; }
.${p}-section-title { padding: 0; border-bottom: 3px solid var(--${p}-primary); padding-bottom: 8px; }
@media (max-width: 900px) { .${p}-grid { grid-template-columns: 1fr; } }
`;
  } else if (layoutName === "magazine") {
    // Magazine: bold colors, more visual emphasis
    variant = `
/* Magazine variant */
.${p}-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; }
.${p}-card-title { font-size: 15px; }
.${p}-card-excerpt { -webkit-line-clamp: 2; }
.${p}-header { padding: 36px 0 28px; text-align: center; }
.${p}-header-inner { flex-direction: column; gap: 8px; }
.${p}-header-meta { text-align: center; max-width: none; }
.${p}-brand-text { font-size: 42px; }
.${p}-nav { background: var(--${p}-text); }
.${p}-nav-inner { justify-content: center; }
.${p}-nav .${p}-nav-link:hover { background: var(--${p}-primary); }
.${p}-nav .${p}-nav-active { background: var(--${p}-primary); }
.${p}-section-title { font-size: 32px; text-transform: uppercase; }
@media (max-width: 1100px) { .${p}-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 800px) { .${p}-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 500px) { .${p}-grid { grid-template-columns: 1fr; } }
`;
  }

  return base + variant;
}

// === Helpers ===

function addAlpha(color: string, alpha: number): string {
  // Convert #RRGGBB to rgba
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.substring(1, 3), 16);
    const g = parseInt(color.substring(3, 5), 16);
    const b = parseInt(color.substring(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return color;
}

function lighten(color: string, amount: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = Math.min(255, Math.round(parseInt(color.substring(1, 3), 16) + 255 * amount));
    const g = Math.min(255, Math.round(parseInt(color.substring(3, 5), 16) + 255 * amount));
    const b = Math.min(255, Math.round(parseInt(color.substring(5, 7), 16) + 255 * amount));
    return `rgb(${r},${g},${b})`;
  }
  return color;
}

function reduceRadius(radius: string): string {
  // "8px" → "4px", "0px" → "0px", "9999px" → "9999px"
  const m = radius.match(/^(\d+)px$/);
  if (!m) return radius;
  const px = parseInt(m[1]);
  if (px === 0) return "0px";
  if (px > 100) return radius;
  return Math.max(2, Math.floor(px / 2)) + "px";
}
