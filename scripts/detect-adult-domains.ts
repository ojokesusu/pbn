/**
 * detect-adult-domains.ts
 *
 * Bulk-scan all Domain rows for adult-pattern hits (porn, xxx, sex, etc.) and
 * flag matches by setting isAdult=true + adultDetectedAt=now() in a single
 * transaction. Outputs a JSON report with detected_count, per-pattern
 * distribution, and sample of first 20 detected domains.
 *
 * Patterns are matched case-insensitively against both url and name fields.
 * Word-boundary aware where reasonable (short tokens use \b); compound tokens
 * like "xnxx" or "milf" are matched as substrings since they rarely false-positive.
 *
 * NOTE: uses prisma.$executeRawUnsafe for the UPDATE because the generated
 * Prisma client may not yet expose isAdult/adultDetectedAt typings on every
 * machine (client regen requires stopping the Next.js dev server which is
 * out of scope here). The schema migration has already added the columns.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Patterns. Each entry: { name, regex }
// - "primary" tokens: short, treat as word-boundary where it matters (sex, xxx, tit, etc.)
//   to avoid hitting words like "essex", "sextant", "title", etc.
// - "broader" tokens: longer, distinctive — match as substring (case-insensitive)
const PRIMARY_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'porn',    regex: /porn/i },
  { name: 'xxx',     regex: /xxx/i },
  { name: 'sex',     regex: /(^|[^a-z])sex([^a-z]|$)/i },
  { name: 'adult',   regex: /adult/i },
  { name: 'escort',  regex: /escort/i },
  { name: 'hentai',  regex: /hentai/i },
  { name: 'nude',    regex: /nude/i },
  { name: 'fuck',    regex: /fuck/i },
  { name: 'cock',    regex: /(^|[^a-z])cock([^a-z]|$)/i },
  { name: 'dick',    regex: /(^|[^a-z])dick([^a-z]|$)/i },
  { name: 'tit',     regex: /(^|[^a-z])tits?([^a-z]|$)/i },
  { name: 'pussy',   regex: /pussy/i },
  { name: 'bdsm',    regex: /bdsm/i },
  { name: 'fetish',  regex: /fetish/i },
  { name: 'webcam',  regex: /webcam/i },
];

const BROADER_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'xnxx',       regex: /xnxx/i },
  { name: 'pornhub',    regex: /pornhub/i },
  { name: 'redtube',    regex: /redtube/i },
  { name: 'brazzers',   regex: /brazzers/i },
  { name: 'youporn',    regex: /youporn/i },
  { name: 'xvideos',    regex: /xvideos/i },
  { name: 'xhamster',   regex: /xhamster/i },
  { name: 'milf',       regex: /milf/i },
  { name: 'anal',       regex: /(^|[^a-z])anal([^a-z]|$)/i },
  { name: 'blowjob',    regex: /blowjob/i },
  { name: 'kink',       regex: /(^|[^a-z])kink/i },
  { name: 'swinger',    regex: /swinger/i },
  { name: 'slut',       regex: /slut/i },
  { name: 'whore',      regex: /whore/i },
  { name: 'hardcore',   regex: /hardcore/i },
  { name: 'erotic',     regex: /erotic/i },
  { name: 'hookup',     regex: /hookup/i },
  { name: 'sextoy',     regex: /sextoy/i },
  { name: 'jerkoff',    regex: /jerkoff/i },
  { name: 'masturbat',  regex: /masturbat/i },
  { name: 'jizz',       regex: /jizz/i },
  { name: 'sperm',      regex: /sperm/i },
  { name: 'semen',      regex: /(^|[^a-z])semen([^a-z]|$)/i },
  { name: 'gloryhole',  regex: /gloryhole/i },
  { name: 'sissy',      regex: /sissy/i },
  { name: 'trannie',    regex: /trannie/i },
  { name: 'tranny',     regex: /tranny/i },
  { name: 'shemale',    regex: /shemale/i },
  { name: 'ladyboy',    regex: /ladyboy/i },
  { name: 'twink',      regex: /twink/i },
  { name: 'sexcam',     regex: /sexcam/i },
  { name: 'livesex',    regex: /livesex/i },
  { name: 'camgirl',    regex: /camgirl/i },
  { name: 'camboy',     regex: /camboy/i },
];

const ALL_PATTERNS = [...PRIMARY_PATTERNS, ...BROADER_PATTERNS];

function matchPatterns(haystack: string): string[] {
  if (!haystack) return [];
  const hits: string[] = [];
  for (const p of ALL_PATTERNS) {
    if (p.regex.test(haystack)) hits.push(p.name);
  }
  return hits;
}

async function main() {
  console.log(`[detect-adult] loading domains...`);
  const domains = await prisma.domain.findMany({
    select: { id: true, name: true, url: true },
  });
  console.log(`[detect-adult] loaded ${domains.length} domains`);

  const detected: Array<{ id: string; url: string; name: string; matched: string[] }> = [];
  const byPattern: Record<string, number> = {};

  for (const d of domains) {
    const blob = `${d.url || ''} ${d.name || ''}`;
    const hits = matchPatterns(blob);
    if (hits.length === 0) continue;
    detected.push({ id: d.id, url: d.url, name: d.name, matched: hits });
    for (const h of hits) byPattern[h] = (byPattern[h] || 0) + 1;
  }

  console.log(`[detect-adult] detected=${detected.length}`);

  // Bulk update inside one transaction. Use raw SQL since the generated
  // Prisma client may not yet have the new fields typed.
  if (detected.length > 0) {
    const ids = detected.map((d) => d.id);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      // Chunked UPDATE to avoid huge IN clauses on PG
      const CHUNK = 500;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        await tx.$executeRawUnsafe(
          `UPDATE "pbn"."Domain"
             SET "isAdult" = true,
                 "adultDetectedAt" = $1
           WHERE "id" = ANY($2::text[])`,
          now,
          chunk
        );
      }
    });
    console.log(`[detect-adult] updated ${detected.length} rows`);
  }

  // Sort by_pattern descending
  const byPatternSorted: Record<string, number> = {};
  Object.keys(byPattern)
    .sort((a, b) => byPattern[b] - byPattern[a])
    .forEach((k) => {
      byPatternSorted[k] = byPattern[k];
    });

  const payload = {
    run_at: new Date().toISOString(),
    total_scanned: domains.length,
    detected_count: detected.length,
    by_pattern: byPatternSorted,
    sample_domains: detected.slice(0, 20).map((d) => ({
      id: d.id,
      url: d.url,
      name: d.name,
      matched: d.matched,
    })),
  };

  const outDir = 'D:/Users/user16/pbn/migration';
  const outPath = path.join(outDir, 'adult-detection-2026-06-03.json');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[detect-adult] wrote ${outPath}`);
  console.log(`[detect-adult] detected_count=${detected.length}`);
  console.log(`[detect-adult] top patterns:`, JSON.stringify(byPatternSorted));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
