import { fetchFromUrl } from "../src/lib/rss-scraper";
import { rssImageAdapter } from "../src/lib/images/adapters/rss-image";
import { pickImages } from "../src/lib/images";

async function main() {
  console.log("=== Detik Politik RSS — carry imageUrl? ===");
  const items = await fetchFromUrl("https://news.detik.com/pemilu/rss", 5);
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    console.log(`  [${i}] ${(a.title || "").slice(0, 60)}`);
    console.log(`      img: ${a.imageUrl || "(none)"}`);
  }

  console.log("\n=== rss_image adapter ===");
  const r1 = await rssImageAdapter.fetch({
    niche: "politik",
    rssImageUrl: items[0]?.imageUrl,
  });
  console.log("result:", r1);

  console.log("\n=== pickImages end-to-end politik with real RSS image ===");
  const imgs = await pickImages(
    {
      niche: "politik",
      articleUrl: items[0]?.link,
      rssImageUrl: items[0]?.imageUrl,
      query: items[0]?.title,
      language: "id",
    },
    2,
  );
  for (let i = 0; i < imgs.length; i++) {
    console.log(`  [${i}] ${imgs[i].sourceLabel}: ${imgs[i].url.slice(0, 80)}`);
    console.log(`      caption: ${imgs[i].attribution}`);
  }
}

main().catch((e) => console.error("ERR:", e));
