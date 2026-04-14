import { PrismaClient } from "@prisma/client";
import { generateUniqueThemeForGenre, generateCssForLayout, GENRE_OPTIONS } from "../src/lib/theme-engine";

const prisma = new PrismaClient();

const TOTAL = 1000;

// Generate random IP address
function randomIP() {
  return `${Math.floor(Math.random() * 200) + 10}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

// Generate random username from domain
function usernameFromDomain(num: number) {
  const prefixes = ["pbn", "web", "site", "host", "srv", "usr", "acc", "net", "dom", "adm"];
  const prefix = prefixes[num % prefixes.length];
  return `${prefix}${num}`;
}

// Generate random password
function randomPassword() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let pass = "";
  for (let i = 0; i < 16; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  return pass;
}

async function main() {
  console.log(`\n🚀 Generating ${TOTAL} dummy domains...\n`);
  const startTime = Date.now();

  // Track progress
  let serversCreated = 0;
  let themesCreated = 0;
  let domainsCreated = 0;

  // Process in batches of 50 for performance
  const BATCH_SIZE = 50;
  const totalBatches = Math.ceil(TOTAL / BATCH_SIZE);

  for (let batch = 0; batch < totalBatches; batch++) {
    const batchStart = batch * BATCH_SIZE;
    const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL);
    const batchNum = batch + 1;

    console.log(`📦 Batch ${batchNum}/${totalBatches} (domain${batchStart + 1} - domain${batchEnd})...`);

    for (let i = batchStart; i < batchEnd; i++) {
      const num = i + 1;
      const genre = GENRE_OPTIONS[i % GENRE_OPTIONS.length];

      // 1. Create server
      const server = await prisma.server.create({
        data: {
          name: `Server-${num}`,
          host: randomIP(),
          username: usernameFromDomain(num),
          password: randomPassword(),
          port: 21,
          status: "active",
        },
      });
      serversCreated++;

      // 2. Generate unique theme
      const seed = 100000 + num; // deterministic seed per domain
      const generated = generateUniqueThemeForGenre(genre, seed);

      const theme = await prisma.theme.create({
        data: {
          name: `Auto Theme - ${generated.layoutName} - ${genre} (${generated.cssPrefix})`,
          templateName: generated.layoutName,
          layoutName: generated.layoutName,
          cssPrefix: generated.cssPrefix,
          primaryColor: generated.primaryColor,
          secondaryColor: generated.secondaryColor,
          accentColor: generated.accentColor,
          bgColor: generated.bgColor,
          textColor: generated.textColor,
          fontFamily: generated.fontFamily,
          headingFont: generated.headingFont,
          borderRadius: generated.borderRadius,
          shadowStyle: generated.shadowStyle,
          spacingScale: generated.spacingScale,
          containerWidth: generated.containerWidth,
          headerStyle: generated.headerStyle,
          footerStyle: generated.footerStyle,
          generatedCss: generated.generatedCss,
          isGenerated: true,
        },
      });
      themesCreated++;

      // 3. Create domain
      await prisma.domain.create({
        data: {
          name: `Domain ${num}`,
          url: `https://domain${num}.com`,
          serverId: server.id,
          themeId: theme.id,
          genre,
          status: "active",
        },
      });
      domainsCreated++;
    }

    // Progress update
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const percent = Math.round((batchEnd / TOTAL) * 100);
    console.log(`   ✅ ${percent}% done (${domainsCreated}/${TOTAL}) — ${elapsed}s elapsed`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n🎉 Selesai dalam ${totalTime} detik!`);
  console.log(`   📦 ${serversCreated} server dibuat`);
  console.log(`   🎨 ${themesCreated} tema unik dibuat`);
  console.log(`   🌐 ${domainsCreated} domain dibuat`);

  // Verify totals
  const totalServers = await prisma.server.count();
  const totalThemes = await prisma.theme.count();
  const totalDomains = await prisma.domain.count();
  console.log(`\n📊 Total di database:`);
  console.log(`   Server: ${totalServers}`);
  console.log(`   Tema: ${totalThemes}`);
  console.log(`   Domain: ${totalDomains}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
