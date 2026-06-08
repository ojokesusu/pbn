// Audit Contabo over-cap state. List domains per server, classify recommended
// action, output CSV for manual triage. --apply auto-writes off the safest
// tier (no content + dead + never deployed).

import "dotenv/config";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

const { Client } = pg;
const APPLY = process.argv.includes("--apply");

function classify(row) {
  if (row.writeOff) return "already_writeoff";
  if (row.isAlive && row.article_count >= 5) return "KEEP";
  if (row.isAlive && row.article_count < 5) return "KEEP_low_content";
  if (!row.isAlive && row.lastDeployed) return "investigate_then_writeoff";
  return "writeoff_no_content";
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const overcap = await c.query(
    `SELECT s.label, s."domainCap",
       (SELECT COUNT(*) FROM "pbn"."Domain" d WHERE d."serverId"=s.id AND d."writeOff"=false)::int AS domains_now
     FROM "pbn"."Server" s
     WHERE s.provider = 'contabo' AND s.status = 'quarantined'
     ORDER BY s.label`,
  );
  console.log("Contabo over-cap state:");
  for (const r of overcap.rows) {
    const ratio = r.domainCap > 0 ? (r.domains_now / r.domainCap).toFixed(1) : "?";
    console.log(`  ${r.label}: ${r.domains_now}/${r.domainCap} (${ratio}x cap)`);
  }

  const details = await c.query(
    `SELECT s.label AS server_label, d.url, d."isAlive", d."writeOff",
       d."lastDeployed", d."lastChecked", d."httpStatus",
       COUNT(a.id)::int AS article_count
     FROM "pbn"."Server" s
     JOIN "pbn"."Domain" d ON d."serverId" = s.id
     LEFT JOIN "pbn"."Article" a ON a."domainId" = d.id
     WHERE s.provider = 'contabo'
     GROUP BY s.label, d.id
     ORDER BY s.label, d."isAlive" DESC, d."lastDeployed" DESC NULLS LAST`,
  );

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveDir = path.join("scripts", ".archive");
  fs.mkdirSync(archiveDir, { recursive: true });
  const csvPath = path.join(archiveDir, `contabo-overcap-audit-${ts}.csv`);

  const header = "server,url,isAlive,writeOff,lastDeployed,lastChecked,httpStatus,articles,recommended_action\n";
  const rows = details.rows
    .map((r) =>
      [r.server_label, r.url, r.isAlive, r.writeOff, r.lastDeployed || "", r.lastChecked || "", r.httpStatus || 0, r.article_count, classify(r)].join(","),
    )
    .join("\n");
  fs.writeFileSync(csvPath, header + rows);
  console.log(`\nCSV: ${csvPath}`);
  console.log(`Total Contabo domains: ${details.rows.length}`);

  const counts = {};
  for (const r of details.rows) {
    const a = classify(r);
    counts[a] = (counts[a] || 0) + 1;
  }
  console.log("\nRecommended action:");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);

  if (!APPLY) {
    console.log(`\n[DRY] Audit-only. Re-run with --apply to writeOff 'writeoff_no_content' tier (safest).`);
    await c.end();
    return;
  }

  const toWriteOff = details.rows.filter((r) => classify(r) === "writeoff_no_content");
  console.log(`\n[APPLY] Writing off ${toWriteOff.length} Contabo domains (no content + dead + never deployed)...`);
  let written = 0;
  for (const r of toWriteOff) {
    await c.query(`UPDATE "pbn"."Domain" SET "writeOff" = true, "lastChecked" = NOW() WHERE url = $1`, [r.url]);
    written++;
  }
  console.log(`Done: ${written} writeOff applied.`);
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
