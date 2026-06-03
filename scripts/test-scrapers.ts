import { scraperEsportskuAdapter } from "../src/lib/content-sources/adapters/scraper-esportsku";
import { scraperRumahAdapter } from "../src/lib/content-sources/adapters/scraper-rumah";
import { scraperJobsdbAdapter } from "../src/lib/content-sources/adapters/scraper-jobsdb";
import { scraperGlintsAdapter } from "../src/lib/content-sources/adapters/scraper-glints";
import { scraperMommiesAdapter } from "../src/lib/content-sources/adapters/scraper-mommies";
import { scraperFemaleDailyAdapter } from "../src/lib/content-sources/adapters/scraper-female-daily";
import type { ContentSourceRow, ContentAdapter } from "../src/lib/content-sources/types";

const DUMMY: ContentSourceRow = {
  id: "x",
  name: "x",
  url: "x",
  niche: "x",
  language: "id",
  region: "ID",
  type: "scraper",
  adapter: "x",
  config: null,
};

async function test(adapter: ContentAdapter, label: string) {
  try {
    const items = await adapter.fetch(DUMMY, 5);
    console.log(`${label.padEnd(20)} -> ${items.length} items`);
    if (items[0]) console.log(`  first: ${items[0].title?.slice(0, 80)}`);
    if (items[0]) console.log(`  url:   ${items[0].url}`);
  } catch (e) {
    console.log(`${label} ERROR:`, (e as Error).message);
  }
}

async function main() {
  await test(scraperEsportskuAdapter, "Esportsku");
  await test(scraperRumahAdapter, "Rumah.com");
  await test(scraperJobsdbAdapter, "JobsDB");
  await test(scraperGlintsAdapter, "Glints");
  await test(scraperMommiesAdapter, "Mommies Daily");
  await test(scraperFemaleDailyAdapter, "Female Daily");
}
main();
