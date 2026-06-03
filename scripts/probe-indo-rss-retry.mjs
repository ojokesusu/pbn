// Second-pass probe — retries the 24 dead URLs with realistic browser headers
// and a few alternate paths. Some sites (Tribunnews, Bola.com, GridOto) block
// rss-parser's default UA via Cloudflare; manual fetch + parse usually works.

import Parser from "rss-parser";

const RETRY = [
  // Kompas — actual canonical RSS index is /rss not /rss/{section}
  { name: "Kompas Headline",       url: "https://rss.kompas.com/kompascom",                       niche: "nasional" },
  { name: "Kompas Headline (alt)", url: "https://indeks.kompas.com/?type=rss",                    niche: "nasional" },
  { name: "Tribunnews Index",      url: "https://www.tribunnews.com/rss",                         niche: "nasional" },
  { name: "Tribun Nasional",       url: "https://www.tribunnews.com/rss/nasional",                niche: "politik" },
  { name: "Tribun Metropolitan",   url: "https://www.tribunnews.com/rss/metropolitan",            niche: "kriminal" },
  { name: "Tribun Superskor",      url: "https://www.tribunnews.com/rss/superskor",               niche: "bola" },
  { name: "Tribun Otomotif",       url: "https://www.tribunnews.com/rss/otomotif",                niche: "otomotif" },
  { name: "Tribun Bisnis",         url: "https://www.tribunnews.com/rss/bisnis",                  niche: "ekonomi" },
  { name: "Liputan6 News",         url: "https://www.liputan6.com/feed",                          niche: "nasional" },
  { name: "Liputan6 News (alt)",   url: "https://feed.liputan6.com/rss/news",                     niche: "nasional" },
  { name: "Bisnis Indonesia",      url: "https://www.bisnis.com/index.xml",                       niche: "ekonomi" },
  { name: "Bisnis Indonesia v2",   url: "https://feed.bisnis.com/rss/bisnis",                     niche: "ekonomi" },
  { name: "Suara News",            url: "https://www.suara.com/rss",                              niche: "nasional" },
  { name: "Suara News (alt)",      url: "https://www.suara.com/feed",                             niche: "nasional" },
  { name: "Bola.com Feed",         url: "https://www.bola.com/rss",                               niche: "bola" },
  { name: "Bola.com (alt)",        url: "https://www.bola.com/feed",                              niche: "bola" },
  { name: "Bola.net",              url: "https://www.bola.net/rss",                               niche: "bola" },
  { name: "Bola.net (alt)",        url: "https://www.bola.net/feed",                              niche: "bola" },
  { name: "GridOto",               url: "https://www.gridoto.com/feed",                           niche: "otomotif" },
  { name: "GridOto (alt)",         url: "https://www.gridoto.com/index.xml",                      niche: "otomotif" },
  { name: "Otomotifnet",           url: "https://otomotifnet.gridoto.com/feed",                   niche: "otomotif" },
  // New candidates not in first round
  { name: "JPNN",                  url: "https://www.jpnn.com/index.php?mib=rss",                 niche: "politik" },
  { name: "Kumparan",              url: "https://kumparan.com/feed",                              niche: "nasional" },
  { name: "Merdeka",               url: "https://www.merdeka.com/feed/feed.rss",                  niche: "nasional" },
  { name: "Vivanews",              url: "https://www.viva.co.id/rss",                             niche: "nasional" },
  { name: "BeritaSatu",            url: "https://www.beritasatu.com/rss",                         niche: "nasional" },
  { name: "iNews",                 url: "https://www.inews.id/feeds",                             niche: "nasional" },
  { name: "Kontan",                url: "https://www.kontan.co.id/rss",                           niche: "ekonomi" },
  { name: "Kontan Investasi",      url: "https://investasi.kontan.co.id/rss",                     niche: "finance" },
  { name: "IDN Times",             url: "https://www.idntimes.com/feed",                          niche: "hiburan" },
  { name: "BBC Indonesia",         url: "https://feeds.bbci.co.uk/indonesia/rss.xml",             niche: "internasional" },
  { name: "Tirto",                 url: "https://tirto.id/feed",                                  niche: "nasional" },
  { name: "Mongabay Indonesia",    url: "https://www.mongabay.co.id/feed/",                       niche: "nasional" },
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/rss+xml, application/xml, text/xml, */*",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
};

const parser = new Parser({ timeout: 10_000, headers: HEADERS });

async function probe(c) {
  const started = Date.now();
  try {
    // Manual fetch first — some sites need real browser headers.
    const res = await fetch(c.url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return { ok: false, ...c, error: `HTTP ${res.status}`, elapsedMs: Date.now() - started };
    }
    const xml = await res.text();
    if (!/<rss|<feed|<rdf/i.test(xml.slice(0, 500))) {
      return { ok: false, ...c, error: "not RSS/Atom (likely HTML)", elapsedMs: Date.now() - started };
    }
    const feed = await parser.parseString(xml);
    const count = (feed.items || []).length;
    const latest = (feed.items || [])[0];
    return {
      ok: count > 0,
      ...c,
      itemCount: count,
      latestTitle: latest?.title?.slice(0, 80) || null,
      elapsedMs: Date.now() - started,
    };
  } catch (e) {
    return { ok: false, ...c, error: e.message?.slice(0, 120), elapsedMs: Date.now() - started };
  }
}

const results = await Promise.all(RETRY.map(probe));
const live = results.filter((r) => r.ok);
const dead = results.filter((r) => !r.ok);

console.log(`\n=== RETRY LIVE (${live.length}/${RETRY.length}) ===`);
for (const r of live) {
  console.log(`  ${r.name.padEnd(28)} [${r.niche.padEnd(13)}] ${String(r.itemCount).padStart(3)} items  ${r.elapsedMs}ms`);
}

console.log(`\n=== STILL DEAD (${dead.length}/${RETRY.length}) ===`);
for (const r of dead) {
  console.log(`  ${r.name.padEnd(28)} [${r.niche.padEnd(13)}] ${r.error}`);
}

const fs = await import("fs/promises");
await fs.writeFile("scripts/.indo-rss-retry.json", JSON.stringify({ live, dead, probedAt: new Date().toISOString() }, null, 2));
console.log(`\nSaved -> scripts/.indo-rss-retry.json`);
