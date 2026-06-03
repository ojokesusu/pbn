// Smoke test the 4 Phase 2 adapters against live endpoints.
// Plain Node ESM — no Prisma client dependency. Tests:
//   • CoinGecko trending + markets (no key)
//   • BMKG gempaterkini (no key)
//   • API-Football fixtures (key from env, gracefully skips if missing)
//   • TMDB trending_movie (key from env, gracefully skips if missing)

import "dotenv/config";

const TIMEOUT_MS = 10_000;

async function testCoinGecko() {
  console.log("\n=== CoinGecko Trending ===");
  const res = await fetch("https://api.coingecko.com/api/v3/search/trending", {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    console.log(`  FAIL: HTTP ${res.status}`);
    return;
  }
  const data = await res.json();
  const coins = data.coins?.slice(0, 3) || [];
  console.log(`  OK: ${data.coins?.length || 0} coins trending`);
  for (const c of coins) {
    const price = c.item.data?.price ?? "?";
    const change = c.item.data?.price_change_percentage_24h?.usd?.toFixed(2) ?? "?";
    console.log(`    - ${c.item.name} (${c.item.symbol.toUpperCase()}) $${price} (${change}%)`);
  }
}

async function testCoinGeckoMarkets() {
  console.log("\n=== CoinGecko Markets (top 5) ===");
  const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=5&page=1&sparkline=false&price_change_percentage=24h";
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    console.log(`  FAIL: HTTP ${res.status}`);
    return;
  }
  const coins = await res.json();
  console.log(`  OK: ${coins.length} coins`);
  for (const c of coins) {
    console.log(`    - ${c.name} (${c.symbol.toUpperCase()}) $${c.current_price?.toLocaleString("en-US")} (${c.price_change_percentage_24h?.toFixed(2)}%)`);
  }
}

async function testBMKG() {
  console.log("\n=== BMKG gempaterkini ===");
  const res = await fetch("https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json", {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    console.log(`  FAIL: HTTP ${res.status}`);
    return;
  }
  const data = await res.json();
  const raw = data.Infogempa?.gempa;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  console.log(`  OK: ${list.length} gempa records`);
  for (const g of list.slice(0, 3)) {
    console.log(`    - M${g.Magnitude} ${g.Wilayah} (${g.DateTime}) kedalaman ${g.Kedalaman}`);
  }
}

async function testApiFootball() {
  console.log("\n=== API-Football fixtures (next 5) ===");
  const key = process.env.API_FOOTBALL_KEY?.trim();
  if (!key) {
    console.log("  SKIP: API_FOOTBALL_KEY not set in env");
    return;
  }
  const res = await fetch("https://v3.football.api-sports.io/fixtures?next=5", {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "x-apisports-key": key, Accept: "application/json" },
  });
  if (!res.ok) {
    console.log(`  FAIL: HTTP ${res.status}`);
    return;
  }
  const data = await res.json();
  console.log(`  OK: ${data.response?.length || 0} fixtures (results: ${data.results}, total subscriptions limit: ${data.paging?.total})`);
  for (const f of (data.response || []).slice(0, 3)) {
    console.log(`    - ${f.teams.home.name} vs ${f.teams.away.name} (${f.league.name}) @ ${f.fixture.date}`);
  }
}

async function testTmdb() {
  console.log("\n=== TMDB Trending Movies (day) ===");
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) {
    console.log("  SKIP: TMDB_API_KEY not set in env");
    return;
  }
  const url = `https://api.themoviedb.org/3/trending/movie/day?api_key=${encodeURIComponent(key)}&language=id-ID&region=ID`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    console.log(`  FAIL: HTTP ${res.status}`);
    return;
  }
  const data = await res.json();
  console.log(`  OK: ${data.results?.length || 0} trending movies`);
  for (const m of (data.results || []).slice(0, 3)) {
    console.log(`    - ${m.title} (${m.release_date}) rating ${m.vote_average}/10`);
  }
}

await testCoinGecko();
await testCoinGeckoMarkets();
await testBMKG();
await testApiFootball();
await testTmdb();
console.log("\nDone.");
