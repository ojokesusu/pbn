import { PrismaClient } from "@prisma/client";

/**
 * Backfill niche for existing RssSource rows that have niche=''.
 *
 * Strategy: parse `q=` param from URL (Google News RSS search query) and
 * map known Indonesian/English keywords to a canonical niche slug.
 */

const KEYWORD_NICHE: Array<{ match: RegExp; niche: string }> = [
  { match: /teknologi|technology|tech/i, niche: "tech" },
  { match: /kesehatan|health|wellness/i, niche: "health" },
  { match: /keuangan|finance|investasi|investing/i, niche: "finance" },
  { match: /bisnis|business|startup/i, niche: "business" },
  { match: /pendidikan|education/i, niche: "education" },
  { match: /wisata|travel/i, niche: "travel" },
  { match: /kuliner|resep|food|recipe/i, niche: "food" },
  { match: /olahraga|sport|bola/i, niche: "sports" },
  { match: /otomotif|mobil|motor|automotive/i, niche: "automotive" },
  { match: /hiburan|selebriti|entertainment/i, niche: "entertainment" },
  { match: /lifestyle|gaya hidup/i, niche: "lifestyle" },
];

function inferNiche(url: string, name: string): string {
  // Try ?q= param first
  let q = "";
  try {
    const u = new URL(url);
    q = u.searchParams.get("q") ?? "";
  } catch {
    // ignore
  }
  const haystack = `${q} ${name}`;
  for (const { match, niche } of KEYWORD_NICHE) {
    if (match.test(haystack)) return niche;
  }
  return "";
}

async function main() {
  const p = new PrismaClient();
  try {
    const rows = await p.rssSource.findMany({ where: { niche: "" } });
    console.log(`Found ${rows.length} rows with empty niche`);
    let updated = 0;
    const summary: Record<string, number> = {};
    for (const r of rows) {
      const niche = inferNiche(r.url, r.name);
      if (!niche) {
        console.log(`  SKIP ${r.name} (${r.url}) — no match`);
        continue;
      }
      await p.rssSource.update({
        where: { id: r.id },
        data: { niche },
      });
      summary[niche] = (summary[niche] ?? 0) + 1;
      updated++;
      console.log(`  ${r.name} -> ${niche}`);
    }
    console.log("---");
    console.log(JSON.stringify({ scanned: rows.length, updated, by_niche: summary }, null, 2));
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
