// Phase 1 ContentSource seed — pure pg via DATABASE_URL.
// Avoids Prisma client entirely (it's mid-regen on the dev box). Idempotent
// upsert on URL — re-running is safe.

import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const LIVE_RSS = [
  { name: "Detik News",        url: "https://news.detik.com/berita/rss",                  niche: "nasional" },
  { name: "Detik Politik",     url: "https://news.detik.com/pemilu/rss",                  niche: "politik" },
  { name: "Detik Finance",     url: "https://finance.detik.com/rss",                      niche: "finance" },
  { name: "Detik Sport",       url: "https://sport.detik.com/rss",                        niche: "sport" },
  { name: "Detik Inet",        url: "https://inet.detik.com/rss",                         niche: "tech" },
  { name: "Detik Hot",         url: "https://hot.detik.com/rss",                          niche: "hiburan" },
  { name: "Detik Health",      url: "https://health.detik.com/rss",                       niche: "health" },
  { name: "Detik Oto",         url: "https://oto.detik.com/rss",                          niche: "otomotif" },
  { name: "Detik Travel",      url: "https://travel.detik.com/rss",                       niche: "travel" },
  { name: "Detik Food",        url: "https://food.detik.com/rss",                         niche: "food" },
  { name: "CNN Nasional",      url: "https://www.cnnindonesia.com/nasional/rss",          niche: "politik" },
  { name: "CNN Internasional", url: "https://www.cnnindonesia.com/internasional/rss",     niche: "internasional" },
  { name: "CNN Ekonomi",       url: "https://www.cnnindonesia.com/ekonomi/rss",           niche: "ekonomi" },
  { name: "CNN Olahraga",      url: "https://www.cnnindonesia.com/olahraga/rss",          niche: "sport" },
  { name: "CNN Hiburan",       url: "https://www.cnnindonesia.com/hiburan/rss",           niche: "hiburan" },
  { name: "CNN Teknologi",     url: "https://www.cnnindonesia.com/teknologi/rss",         niche: "tech" },
  { name: "Liputan6 News",     url: "https://feed.liputan6.com/rss/news",                 niche: "nasional" },
  { name: "Liputan6 Showbiz",  url: "https://feed.liputan6.com/rss/showbiz",              niche: "hiburan" },
  { name: "Liputan6 Bola",     url: "https://feed.liputan6.com/rss/bola",                 niche: "bola" },
  { name: "Liputan6 Tekno",    url: "https://feed.liputan6.com/rss/tekno",                niche: "tech" },
  { name: "Liputan6 Bisnis",   url: "https://feed.liputan6.com/rss/bisnis",               niche: "ekonomi" },
  { name: "Liputan6 Health",   url: "https://feed.liputan6.com/rss/health",               niche: "health" },
  { name: "Liputan6 Otomotif", url: "https://feed.liputan6.com/rss/otomotif",             niche: "otomotif" },
  { name: "Tempo Nasional",      url: "https://rss.tempo.co/nasional",      niche: "politik" },
  { name: "Tempo Bisnis",        url: "https://rss.tempo.co/bisnis",        niche: "ekonomi" },
  { name: "Tempo Hukum",         url: "https://rss.tempo.co/hukum",         niche: "hukum" },
  { name: "Tempo Internasional", url: "https://rss.tempo.co/dunia",         niche: "internasional" },
  { name: "Tempo Otomotif",      url: "https://rss.tempo.co/otomotif",      niche: "otomotif" },
  { name: "Antara Terkini",  url: "https://www.antaranews.com/rss/terkini",  niche: "nasional" },
  { name: "Antara Politik",  url: "https://www.antaranews.com/rss/politik",  niche: "politik" },
  { name: "Antara Hukum",    url: "https://www.antaranews.com/rss/hukum",    niche: "hukum" },
  { name: "Antara Ekonomi",  url: "https://www.antaranews.com/rss/ekonomi",  niche: "ekonomi" },
  { name: "Antara Olahraga", url: "https://www.antaranews.com/rss/olahraga", niche: "sport" },
  { name: "Antara Hiburan",  url: "https://www.antaranews.com/rss/hiburan",  niche: "hiburan" },
  { name: "Antara Tekno",    url: "https://www.antaranews.com/rss/tekno",    niche: "tech" },
  { name: "Republika Khazanah", url: "https://www.republika.co.id/rss/khazanah", niche: "religion" },
  { name: "Republika News",     url: "https://www.republika.co.id/rss",          niche: "politik" },
  { name: "OkeZone News",       url: "https://sindikasi.okezone.com/index.php/rss/0/RSS2.0", niche: "nasional" },
  { name: "Sindonews Nasional", url: "https://nasional.sindonews.com/rss",                   niche: "politik" },
  { name: "Sindo Ekonomi",      url: "https://ekbis.sindonews.com/rss",                      niche: "ekonomi" },
  { name: "Sindo Olahraga",     url: "https://sports.sindonews.com/rss",                     niche: "sport" },
  { name: "JPNN",               url: "https://www.jpnn.com/index.php?mib=rss",     niche: "politik" },
  { name: "BBC Indonesia",      url: "https://feeds.bbci.co.uk/indonesia/rss.xml", niche: "internasional" },
  { name: "Mongabay Indonesia", url: "https://www.mongabay.co.id/feed/",           niche: "nasional" },
];

const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=id&gl=ID&ceid=ID:id`;

const GOOGLE_NEWS_FALLBACK = [
  { name: "GNews Kriminal",  url: gnews("kriminal OR kepolisian OR \"kasus pidana\""),     niche: "kriminal" },
  { name: "GNews Properti",  url: gnews("properti OR \"real estate\" OR KPR rumah"),       niche: "properti" },
  { name: "GNews Parenting", url: gnews("parenting anak OR ibu hamil OR \"tumbuh kembang\""), niche: "parenting" },
  { name: "GNews Gaming",    url: gnews("game OR esports OR \"mobile legends\" OR PUBG"),  niche: "gaming" },
  { name: "GNews Fashion",   url: gnews("fashion OR outfit OR \"tren mode\""),             niche: "fashion" },
  { name: "GNews Beauty",    url: gnews("skincare OR makeup OR \"perawatan wajah\""),      niche: "beauty" },
  { name: "GNews Musik",     url: gnews("musik OR konser OR \"album baru\""),              niche: "musik" },
  { name: "GNews Film",      url: gnews("film bioskop OR \"rilis film\" OR sutradara"),    niche: "film" },
  { name: "GNews Karir",     url: gnews("lowongan kerja OR karir OR \"info gaji\""),       niche: "karir" },
  { name: "GNews Bencana",   url: gnews("gempa OR banjir OR kebakaran OR BMKG"),           niche: "bencana" },
  { name: "GNews Balap",     url: gnews("MotoGP OR Formula 1 OR balap"),                   niche: "balap" },
  { name: "GNews Bola",      url: gnews("Liga 1 OR Timnas OR \"sepak bola\""),             niche: "bola" },
  { name: "GNews Otomotif",  url: gnews("\"review mobil\" OR \"review motor\" OR otomotif"), niche: "otomotif" },
  { name: "GNews Travel",    url: gnews("wisata OR liburan OR \"destinasi wisata\""),      niche: "travel" },
  { name: "GNews Food",      url: gnews("kuliner OR resep OR \"makanan khas\""),           niche: "food" },
  { name: "GNews Finance",   url: gnews("investasi OR saham OR \"obligasi\""),             niche: "finance" },
];

const ALL = [...LIVE_RSS, ...GOOGLE_NEWS_FALLBACK];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log(`Seeding ${ALL.length} content sources...`);
  let inserted = 0, updated = 0, failed = 0;

  for (const seed of ALL) {
    try {
      // Postgres ON CONFLICT upsert on url. cuid() generation is handled by
      // a fresh random string so we don't need the @default(cuid()) at insert
      // time (column is non-null, defaults applied client-side here).
      const id = `cs_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-6)}`;
      const res = await client.query(
        `
        INSERT INTO "pbn"."RssSource"
          ("id", "name", "url", "niche", "language", "region", "active", "type", "adapter", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, 'id', 'ID', true, 'rss', 'rss_generic', NOW(), NOW())
        ON CONFLICT ("url") DO UPDATE
          SET "name" = EXCLUDED."name",
              "niche" = EXCLUDED."niche",
              "language" = EXCLUDED."language",
              "region" = EXCLUDED."region",
              "active" = true,
              "type" = 'rss',
              "adapter" = 'rss_generic',
              "updatedAt" = NOW()
        RETURNING xmax = 0 AS inserted_new
        `,
        [id, seed.name, seed.url, seed.niche],
      );
      if (res.rows[0].inserted_new) inserted++;
      else updated++;
    } catch (err) {
      failed++;
      console.warn(`  FAIL ${seed.name}: ${err.message?.slice(0, 120)}`);
    }
  }

  const cov = await client.query(
    `SELECT "niche", COUNT(*)::int AS c
     FROM "pbn"."RssSource"
     WHERE "active" = true
     GROUP BY "niche"
     ORDER BY c DESC, "niche"`,
  );

  console.log(`\nDone: ${inserted} inserted, ${updated} updated, ${failed} failed.`);
  console.log(`\nNiche coverage (active sources):`);
  for (const row of cov.rows) {
    console.log(`  ${(row.niche || "(empty)").padEnd(15)} ${row.c}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
