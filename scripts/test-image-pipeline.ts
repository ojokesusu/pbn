// Smoke test for the image pipeline. Hits live endpoints — Unsplash + Pexels
// keys are read from env (set before running: cmd /c "set UNSPLASH_ACCESS_KEY=..."
// PowerShell: $env:UNSPLASH_ACCESS_KEY="..." node ...).

import { pickImages } from "../src/lib/images";

async function testCase(label: string, ctx: Parameters<typeof pickImages>[0]) {
  console.log(`\n=== ${label} ===`);
  console.log(`ctx:`, ctx);
  try {
    const results = await pickImages(ctx, 2);
    console.log(`  -> ${results.length} images`);
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      console.log(`  [${i}] ${r.sourceLabel}: ${r.url.slice(0, 80)}`);
      console.log(`      caption: ${r.attribution}`);
    }
  } catch (e) {
    console.log(`  ERROR:`, (e as Error).message);
  }
}

async function main() {
  // Politik — should hit og-scrape first (real Detik article URL)
  await testCase("politik (Detik article)", {
    niche: "politik",
    articleUrl: "https://news.detik.com/berita/d-7456789",
    query: "Presiden Jokowi pidato",
    language: "id",
  });

  // News — same as politik
  await testCase("news (general)", {
    niche: "news",
    query: "berita Indonesia hari ini",
    language: "id",
  });

  // Bola — should try og-scrape; Wikipedia for famous players
  await testCase("bola", {
    niche: "bola",
    query: "Cristiano Ronaldo",
    language: "id",
  });

  // Gaming — Unsplash + Pexels chain
  await testCase("gaming", {
    niche: "gaming",
    query: "mobile legends esports tournament",
    language: "id",
  });

  // Fashion — Unsplash + Pexels chain
  await testCase("fashion", {
    niche: "fashion",
    query: "fashion week outfit indonesia",
    language: "id",
  });

  // Unknown niche — default chain
  await testCase("unknown niche", {
    niche: "asdfasdf",
    query: "indonesian street food",
    language: "id",
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
