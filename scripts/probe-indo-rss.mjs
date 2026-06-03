import Parser from "rss-parser";

// Group A: Indonesian RSS endpoints to probe.
// Each entry maps to one or more niches; we'll seed ContentSource rows from
// whichever ones come back live.
const CANDIDATES = [
  { name: "Detik News",         url: "https://news.detik.com/berita/rss",                    niche: "nasional" },
  { name: "Detik Politik",      url: "https://news.detik.com/pemilu/rss",                    niche: "politik" },
  { name: "Detik Finance",      url: "https://finance.detik.com/rss",                        niche: "finance" },
  { name: "Detik Sport",        url: "https://sport.detik.com/rss",                          niche: "sport" },
  { name: "Detik Inet (Tech)",  url: "https://inet.detik.com/rss",                           niche: "tech" },
  { name: "Detik Hot",          url: "https://hot.detik.com/rss",                            niche: "hiburan" },
  { name: "Detik Health",       url: "https://health.detik.com/rss",                         niche: "health" },
  { name: "Detik Oto",          url: "https://oto.detik.com/rss",                            niche: "otomotif" },
  { name: "Detik Travel",       url: "https://travel.detik.com/rss",                         niche: "travel" },
  { name: "Detik Food",         url: "https://food.detik.com/rss",                           niche: "food" },
  { name: "Detik Hikmah",       url: "https://hikmah.detik.com/rss",                         niche: "religion" },
  { name: "Detik Properti",     url: "https://properti.detik.com/rss",                       niche: "properti" },
  { name: "Kompas Headline",    url: "https://www.kompas.com/rss",                           niche: "nasional" },
  { name: "Kompas News",        url: "https://news.kompas.com/rss",                          niche: "politik" },
  { name: "Kompas Money",       url: "https://money.kompas.com/rss",                         niche: "ekonomi" },
  { name: "Kompas Bola",        url: "https://bola.kompas.com/rss",                          niche: "bola" },
  { name: "Kompas Tekno",       url: "https://tekno.kompas.com/rss",                         niche: "tech" },
  { name: "Kompas Otomotif",    url: "https://otomotif.kompas.com/rss",                      niche: "otomotif" },
  { name: "Kompas Health",      url: "https://health.kompas.com/rss",                        niche: "health" },
  { name: "Kompas Lifestyle",   url: "https://lifestyle.kompas.com/rss",                     niche: "lifestyle" },
  { name: "Kompas Travel",      url: "https://travel.kompas.com/rss",                        niche: "travel" },
  { name: "Tribunnews Index",   url: "https://www.tribunnews.com/rss",                       niche: "nasional" },
  { name: "Tribun Nasional",    url: "https://www.tribunnews.com/rss/nasional",              niche: "politik" },
  { name: "Tribun Kriminal",    url: "https://www.tribunnews.com/rss/metropolitan",          niche: "kriminal" },
  { name: "Tribun Sport",       url: "https://www.tribunnews.com/rss/superskor",             niche: "bola" },
  { name: "Tribun Otomotif",    url: "https://www.tribunnews.com/rss/otomotif",              niche: "otomotif" },
  { name: "Tribun Bisnis",      url: "https://www.tribunnews.com/rss/bisnis",                niche: "ekonomi" },
  { name: "CNN Nasional",       url: "https://www.cnnindonesia.com/nasional/rss",            niche: "politik" },
  { name: "CNN Internasional",  url: "https://www.cnnindonesia.com/internasional/rss",       niche: "internasional" },
  { name: "CNN Ekonomi",        url: "https://www.cnnindonesia.com/ekonomi/rss",             niche: "ekonomi" },
  { name: "CNN Olahraga",       url: "https://www.cnnindonesia.com/olahraga/rss",            niche: "sport" },
  { name: "CNN Hiburan",        url: "https://www.cnnindonesia.com/hiburan/rss",             niche: "hiburan" },
  { name: "CNN Teknologi",      url: "https://www.cnnindonesia.com/teknologi/rss",           niche: "tech" },
  { name: "Liputan6 News",      url: "https://feed.liputan6.com/rss",                        niche: "nasional" },
  { name: "Liputan6 Showbiz",   url: "https://feed.liputan6.com/rss/showbiz",                niche: "hiburan" },
  { name: "Liputan6 Bola",      url: "https://feed.liputan6.com/rss/bola",                   niche: "bola" },
  { name: "Liputan6 Tekno",     url: "https://feed.liputan6.com/rss/tekno",                  niche: "tech" },
  { name: "Liputan6 Bisnis",    url: "https://feed.liputan6.com/rss/bisnis",                 niche: "ekonomi" },
  { name: "Liputan6 Health",    url: "https://feed.liputan6.com/rss/health",                 niche: "health" },
  { name: "Liputan6 Otomotif",  url: "https://feed.liputan6.com/rss/otomotif",               niche: "otomotif" },
  { name: "Tempo Nasional",     url: "https://rss.tempo.co/nasional",                        niche: "politik" },
  { name: "Tempo Bisnis",       url: "https://rss.tempo.co/bisnis",                          niche: "ekonomi" },
  { name: "Tempo Hukum",        url: "https://rss.tempo.co/hukum",                           niche: "hukum" },
  { name: "Tempo Internasional",url: "https://rss.tempo.co/dunia",                           niche: "internasional" },
  { name: "Tempo Otomotif",     url: "https://rss.tempo.co/otomotif",                        niche: "otomotif" },
  { name: "Antara Terkini",     url: "https://www.antaranews.com/rss/terkini",               niche: "nasional" },
  { name: "Antara Politik",     url: "https://www.antaranews.com/rss/politik",               niche: "politik" },
  { name: "Antara Hukum",       url: "https://www.antaranews.com/rss/hukum",                 niche: "hukum" },
  { name: "Antara Ekonomi",     url: "https://www.antaranews.com/rss/ekonomi",               niche: "ekonomi" },
  { name: "Antara Olahraga",    url: "https://www.antaranews.com/rss/olahraga",              niche: "sport" },
  { name: "Antara Hiburan",     url: "https://www.antaranews.com/rss/hiburan",               niche: "hiburan" },
  { name: "Antara Tekno",       url: "https://www.antaranews.com/rss/tekno",                 niche: "tech" },
  { name: "Republika Khazanah", url: "https://www.republika.co.id/rss/khazanah",             niche: "religion" },
  { name: "Republika News",     url: "https://www.republika.co.id/rss",                      niche: "politik" },
  { name: "Bisnis Indonesia",   url: "https://www.bisnis.com/rss",                           niche: "ekonomi" },
  { name: "OkeZone News",       url: "https://sindikasi.okezone.com/index.php/rss/0/RSS2.0", niche: "nasional" },
  { name: "Sindonews Nasional", url: "https://nasional.sindonews.com/rss",                   niche: "politik" },
  { name: "Sindo Ekonomi",      url: "https://ekbis.sindonews.com/rss",                      niche: "ekonomi" },
  { name: "Sindo Olahraga",     url: "https://sports.sindonews.com/rss",                     niche: "sport" },
  { name: "Suara News",         url: "https://www.suara.com/rss/news",                       niche: "nasional" },
  { name: "Bola.com Feed",      url: "https://www.bola.com/feed/rss.xml",                    niche: "bola" },
  { name: "Bola.net",           url: "https://www.bola.net/feed/",                           niche: "bola" },
  { name: "GridOto",            url: "https://www.gridoto.com/rss",                          niche: "otomotif" },
  { name: "Otomotifnet",        url: "https://otomotifnet.gridoto.com/rss",                  niche: "otomotif" },
];

const parser = new Parser({
  timeout: 10_000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; PBN-Scheduler/1.0; +https://pbn.dashboard)" },
});

async function probe(c) {
  const started = Date.now();
  try {
    const feed = await parser.parseURL(c.url);
    const count = (feed.items || []).length;
    const latest = (feed.items || [])[0];
    return {
      ok: count > 0,
      ...c,
      itemCount: count,
      latestTitle: latest?.title?.slice(0, 80) || null,
      latestDate: latest?.isoDate || latest?.pubDate || null,
      elapsedMs: Date.now() - started,
    };
  } catch (e) {
    return { ok: false, ...c, error: e.message?.slice(0, 120), elapsedMs: Date.now() - started };
  }
}

const results = await Promise.all(CANDIDATES.map(probe));
const live = results.filter((r) => r.ok);
const dead = results.filter((r) => !r.ok);

console.log(`\n=== LIVE (${live.length}/${CANDIDATES.length}) ===`);
for (const r of live) {
  console.log(`  ${r.name.padEnd(24)} [${r.niche.padEnd(13)}] ${String(r.itemCount).padStart(3)} items  ${r.elapsedMs}ms`);
}

console.log(`\n=== DEAD (${dead.length}/${CANDIDATES.length}) ===`);
for (const r of dead) {
  console.log(`  ${r.name.padEnd(24)} [${r.niche.padEnd(13)}] ${r.error || "no items"}`);
}

// Niche coverage report — how many live feeds per niche.
const byNiche = {};
for (const r of live) {
  byNiche[r.niche] = (byNiche[r.niche] || 0) + 1;
}
console.log(`\n=== NICHE COVERAGE (live feeds per niche) ===`);
for (const [n, c] of Object.entries(byNiche).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n.padEnd(15)} ${c}`);
}

// Emit a JSON file so the seed script can consume the validated set without re-probing.
const fs = await import("fs/promises");
await fs.writeFile("scripts/.indo-rss-probe.json", JSON.stringify({ live, dead, byNiche, probedAt: new Date().toISOString() }, null, 2));
console.log(`\nSaved -> scripts/.indo-rss-probe.json`);
