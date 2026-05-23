// Standalone logic test for nicheMatchesArticle.
// Mirror of the function in src/lib/backlink-distributor.ts.
// Run: node scripts/test-niche-match.mjs

const NICHE_ALLOWED_CATEGORIES = {
  igaming:   ["olahraga", "hiburan", "casino", "umum"],
  finance:   ["ekonomi", "bisnis", "investasi", "umum"],
  health:    ["kesehatan", "lifestyle", "umum"],
  ecommerce: ["bisnis", "teknologi", "lifestyle", "umum"],
  travel:    ["wisata", "lifestyle", "umum"],
  tech:      ["teknologi", "umum"],
  news:      ["*"],
};

function nicheMatchesArticle(niche, articleCategory) {
  const n = (niche || "").trim().toLowerCase();
  const c = (articleCategory || "").trim().toLowerCase();
  if (!n || !c) return true;
  const allowed = NICHE_ALLOWED_CATEGORIES[n];
  if (!allowed) return true;
  if (allowed.includes("*")) return true;
  return allowed.includes(c);
}

const cases = [
  // [niche, articleCategory, expected, label]
  ["",        "",          true,  "both empty → legacy match"],
  ["",        "kriminal",  true,  "untagged backlink, tagged article → match"],
  ["igaming", "",          true,  "tagged backlink, untagged article → legacy match"],
  ["igaming", "kriminal",  false, "BUG CASE: igaming backlink, kriminal article → REJECT"],
  ["igaming", "olahraga",  true,  "igaming on olahraga article → match"],
  ["igaming", "hiburan",   true,  "igaming on hiburan → match"],
  ["igaming", "ekonomi",   false, "igaming on ekonomi → reject"],
  ["finance", "ekonomi",   true,  "finance on ekonomi → match"],
  ["finance", "kriminal",  false, "finance on kriminal → reject"],
  ["health",  "kesehatan", true,  "health on kesehatan → match"],
  ["health",  "olahraga",  false, "health on olahraga → reject (not in whitelist)"],
  ["news",    "kriminal",  true,  "news matches anything (*)"],
  ["news",    "umum",      true,  "news matches umum"],
  ["unknown", "kriminal",  true,  "unknown niche → permissive fallback"],
  ["IGAMING", "KRIMINAL",  false, "case-insensitive: still rejects"],
  ["  igaming  ", "olahraga", true, "trims whitespace"],
];

let pass = 0, fail = 0;
for (const [niche, cat, expected, label] of cases) {
  const got = nicheMatchesArticle(niche, cat);
  const ok = got === expected;
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected=${expected} got=${got} (niche="${niche}" cat="${cat}")`);
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
