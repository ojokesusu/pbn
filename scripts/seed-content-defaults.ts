import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Default RSS sources — Google News searches across major niches, ID + EN
// Google News RSS URL pattern: https://news.google.com/rss/search?q=<query>&hl=<lang>&gl=<country>&ceid=<country>:<lang>
const RSS_SOURCES = [
  // Indonesian
  {
    name: "Google News — Teknologi Indonesia",
    url: "https://news.google.com/rss/search?q=teknologi+indonesia&hl=id&gl=ID&ceid=ID:id",
    language: "id",
    region: "ID",
  },
  {
    name: "Google News — Kesehatan",
    url: "https://news.google.com/rss/search?q=kesehatan&hl=id&gl=ID&ceid=ID:id",
    language: "id",
    region: "ID",
  },
  {
    name: "Google News — Bisnis Startup",
    url: "https://news.google.com/rss/search?q=bisnis+startup&hl=id&gl=ID&ceid=ID:id",
    language: "id",
    region: "ID",
  },
  {
    name: "Google News — Investasi",
    url: "https://news.google.com/rss/search?q=investasi&hl=id&gl=ID&ceid=ID:id",
    language: "id",
    region: "ID",
  },
  {
    name: "Google News — Wisata Indonesia",
    url: "https://news.google.com/rss/search?q=wisata+indonesia&hl=id&gl=ID&ceid=ID:id",
    language: "id",
    region: "ID",
  },
  {
    name: "Google News — Kuliner",
    url: "https://news.google.com/rss/search?q=kuliner&hl=id&gl=ID&ceid=ID:id",
    language: "id",
    region: "ID",
  },
  {
    name: "Google News — Pendidikan",
    url: "https://news.google.com/rss/search?q=pendidikan&hl=id&gl=ID&ceid=ID:id",
    language: "id",
    region: "ID",
  },
  {
    name: "Google News — Olahraga",
    url: "https://news.google.com/rss/search?q=olahraga&hl=id&gl=ID&ceid=ID:id",
    language: "id",
    region: "ID",
  },
  // English equivalents
  {
    name: "Google News — Technology",
    url: "https://news.google.com/rss/search?q=technology&hl=en-US&gl=US&ceid=US:en",
    language: "en",
    region: "US",
  },
  {
    name: "Google News — Health",
    url: "https://news.google.com/rss/search?q=health&hl=en-US&gl=US&ceid=US:en",
    language: "en",
    region: "US",
  },
  {
    name: "Google News — Business",
    url: "https://news.google.com/rss/search?q=business&hl=en-US&gl=US&ceid=US:en",
    language: "en",
    region: "US",
  },
  {
    name: "Google News — Finance",
    url: "https://news.google.com/rss/search?q=finance+investing&hl=en-US&gl=US&ceid=US:en",
    language: "en",
    region: "US",
  },
  {
    name: "Google News — Travel",
    url: "https://news.google.com/rss/search?q=travel&hl=en-US&gl=US&ceid=US:en",
    language: "en",
    region: "US",
  },
  {
    name: "Google News — Lifestyle",
    url: "https://news.google.com/rss/search?q=lifestyle&hl=en-US&gl=US&ceid=US:en",
    language: "en",
    region: "US",
  },
];

// Default prompt templates per niche.
// {keyword}, {niche}, {sourceTitle}, {sourceContent}, {language} are placeholders
// the rewrite worker substitutes at runtime.
const SYSTEM_BASE = `You are an expert SEO content writer. Rewrite the given news article into a fresh, original blog post of 800-1000 words in {language} (id = Bahasa Indonesia, en = English). Paraphrase fully — do NOT copy phrases or use direct quotes from the source. Restructure the flow and angle so it reads as a brand-new piece. Target SEO keyword: "{keyword}". Target niche: "{niche}". Do NOT mention, name, or link the source publication. Structure: a hook intro paragraph, then 3-5 H2 sections with substantive body, then a conclusion paragraph with a soft call-to-action. Use natural keyword placement (no stuffing). Output clean Markdown only.`;

const USER_TEMPLATE = `Source article:

Title: {sourceTitle}

{sourceContent}

Target niche: {niche}
Target keyword: {keyword}
Language: {language}

Write the rewritten article now.`;

const PROMPT_TEMPLATES = [
  {
    name: "Default — Generic Rewrite",
    niche: "",
    systemPrompt: SYSTEM_BASE,
    userTemplate: USER_TEMPLATE,
  },
  {
    name: "Finance Niche",
    niche: "finance",
    systemPrompt:
      SYSTEM_BASE +
      `\n\nTone: authoritative, data-driven, cautious. Include a brief disclaimer reminding readers that this is general information, not personalized financial advice. Use concrete figures when present in the source; never invent specific numbers, returns, or prices. Prefer plain explanations over jargon.`,
    userTemplate: USER_TEMPLATE,
  },
  {
    name: "Health Niche",
    niche: "health",
    systemPrompt:
      SYSTEM_BASE +
      `\n\nTone: empathetic, evidence-leaning, careful. Add a clear caveat that the article is informational only and is not a substitute for professional medical advice, diagnosis, or treatment, and encourage readers to consult a qualified healthcare provider. Do NOT prescribe dosages, diagnose, or guarantee outcomes. Avoid sensational health claims.`,
    userTemplate: USER_TEMPLATE,
  },
  {
    name: "Tech Niche",
    niche: "tech",
    systemPrompt:
      SYSTEM_BASE +
      `\n\nTone: clear, technical-but-accessible. Explain mechanisms and trade-offs. Where helpful, briefly compare alternatives or list practical use-cases. Define acronyms on first use. Keep examples concrete.`,
    userTemplate: USER_TEMPLATE,
  },
  {
    name: "Business Niche",
    niche: "business",
    systemPrompt:
      SYSTEM_BASE +
      `\n\nTone: professional, strategic, outcome-oriented. Emphasize business impact, market context, and practical takeaways for operators or founders. Avoid speculation about specific company financials beyond what the source establishes.`,
    userTemplate: USER_TEMPLATE,
  },
  {
    name: "Lifestyle Niche",
    niche: "lifestyle",
    systemPrompt:
      SYSTEM_BASE +
      `\n\nTone: warm, conversational, story-led. Lead with a relatable angle. Offer 3-5 actionable tips inside the H2 sections. Keep sentences short and scannable.`,
    userTemplate: USER_TEMPLATE,
  },
  {
    name: "Travel/Wisata Niche",
    niche: "travel",
    systemPrompt:
      SYSTEM_BASE +
      `\n\nTone: vivid, sensory, inviting. Evoke place — sights, sounds, food, culture — without inventing specific facts the source does not support. Include a brief practical tips section (best time to visit, what to bring, etiquette) when applicable.`,
    userTemplate: USER_TEMPLATE,
  },
];

async function seedRssSources() {
  let created = 0;
  let skipped = 0;
  for (const src of RSS_SOURCES) {
    const existing = await prisma.rssSource.findUnique({ where: { url: src.url } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.rssSource.create({ data: src });
    created++;
  }
  console.log(`RSS sources: created=${created} skipped=${skipped} (total target=${RSS_SOURCES.length})`);
}

async function seedPromptTemplates() {
  let created = 0;
  let skipped = 0;
  for (const tpl of PROMPT_TEMPLATES) {
    // Idempotency: one active template per niche. Check by (niche, name) pair.
    const existing = await prisma.promptTemplate.findFirst({
      where: { niche: tpl.niche, name: tpl.name },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.promptTemplate.create({ data: tpl });
    created++;
  }
  console.log(`Prompt templates: created=${created} skipped=${skipped} (total target=${PROMPT_TEMPLATES.length})`);
}

async function main() {
  console.log("=== Seeding content defaults ===");
  await seedRssSources();
  await seedPromptTemplates();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
