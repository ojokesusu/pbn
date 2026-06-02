import { PrismaClient } from "@prisma/client";

type Seed = {
  name: string;
  url: string;
  language: string;
  region: string;
};

const SEEDS: Seed[] = [
  // Indonesian
  { name: "Teknologi", url: "https://news.google.com/rss/search?q=teknologi+indonesia&hl=id&gl=ID", language: "id", region: "ID" },
  { name: "Kesehatan", url: "https://news.google.com/rss/search?q=kesehatan+indonesia&hl=id&gl=ID", language: "id", region: "ID" },
  { name: "Keuangan", url: "https://news.google.com/rss/search?q=keuangan+investasi&hl=id&gl=ID", language: "id", region: "ID" },
  { name: "Bisnis", url: "https://news.google.com/rss/search?q=bisnis+startup+indonesia&hl=id&gl=ID", language: "id", region: "ID" },
  { name: "Pendidikan", url: "https://news.google.com/rss/search?q=pendidikan+indonesia&hl=id&gl=ID", language: "id", region: "ID" },
  { name: "Travel", url: "https://news.google.com/rss/search?q=wisata+indonesia&hl=id&gl=ID", language: "id", region: "ID" },
  { name: "Kuliner", url: "https://news.google.com/rss/search?q=kuliner+resep&hl=id&gl=ID", language: "id", region: "ID" },
  { name: "Olahraga", url: "https://news.google.com/rss/search?q=olahraga+bola&hl=id&gl=ID", language: "id", region: "ID" },
  { name: "Otomotif", url: "https://news.google.com/rss/search?q=otomotif+mobil+motor&hl=id&gl=ID", language: "id", region: "ID" },
  { name: "Hiburan", url: "https://news.google.com/rss/search?q=hiburan+selebriti&hl=id&gl=ID", language: "id", region: "ID" },
  // English
  { name: "Tech", url: "https://news.google.com/rss/search?q=technology&hl=en&gl=US", language: "en", region: "US" },
  { name: "Health", url: "https://news.google.com/rss/search?q=health+wellness&hl=en&gl=US", language: "en", region: "US" },
  { name: "Finance", url: "https://news.google.com/rss/search?q=finance+investing&hl=en&gl=US", language: "en", region: "US" },
  { name: "Business", url: "https://news.google.com/rss/search?q=business+startup&hl=en&gl=US", language: "en", region: "US" },
];

async function main() {
  const p = new PrismaClient();
  try {
    let inserted = 0;
    let updated = 0;
    for (const s of SEEDS) {
      const existing = await p.rssSource.findUnique({ where: { url: s.url } });
      const res = await p.rssSource.upsert({
        where: { url: s.url },
        create: {
          name: s.name,
          url: s.url,
          language: s.language,
          region: s.region,
          active: true,
          lastFetched: null,
        },
        update: {
          name: s.name,
          language: s.language,
          region: s.region,
          active: true,
        },
      });
      if (existing) updated++;
      else inserted++;
      console.log(`${existing ? "updated" : "inserted"} ${s.language}/${s.region} ${s.name} (${res.id})`);
    }

    const all = await p.rssSource.findMany({
      select: { name: true, language: true, region: true, active: true },
      orderBy: [{ language: "asc" }, { name: "asc" }],
    });
    const byNiche: Record<string, number> = {};
    for (const r of all) {
      byNiche[r.name] = (byNiche[r.name] ?? 0) + 1;
    }

    console.log("---");
    console.log(JSON.stringify({
      seeds_total: SEEDS.length,
      inserted,
      updated,
      total_in_db: all.length,
      by_niche: byNiche,
    }, null, 2));
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
