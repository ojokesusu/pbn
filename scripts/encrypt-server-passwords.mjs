// One-shot migration helper (audit G3): encrypt existing plaintext
// Server.password values into Server.passwordEnc, then blank the plaintext.
//
// Requires PROVISION_PASSWORD_KEY (64-char hex) and DATABASE_URL in the env.
// The AES format here MUST match src/lib/crypto.ts (base64 of iv||tag||ciphertext).
//
//   node scripts/encrypt-server-passwords.mjs          # dry run — reports only
//   node scripts/encrypt-server-passwords.mjs --apply  # actually writes
//
// Safe to run repeatedly: only rows with a plaintext password AND no passwordEnc
// are touched.

import { PrismaClient } from "@prisma/client";
import { createCipheriv, randomBytes } from "node:crypto";

const APPLY = process.argv.includes("--apply");

function getKey() {
  const hex = process.env.PROVISION_PASSWORD_KEY;
  if (!hex || hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("PROVISION_PASSWORD_KEY must be set to a 64-character hex string.");
  }
  return Buffer.from(hex, "hex");
}

function encryptPassword(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

const prisma = new PrismaClient();

async function main() {
  const key = getKey();
  const servers = await prisma.server.findMany({
    select: { id: true, label: true, name: true, password: true, passwordEnc: true },
  });
  const pending = servers.filter((s) => s.password && !s.passwordEnc);

  console.log(`Total servers: ${servers.length}`);
  console.log(`Need encryption (plaintext set, no passwordEnc): ${pending.length}`);
  if (pending.length === 0) {
    console.log("Nothing to do. ✅");
    return;
  }

  for (const s of pending) {
    const enc = encryptPassword(s.password, key);
    console.log(`  ${APPLY ? "ENCRYPT" : "would encrypt"}: ${s.label || s.name} (${s.id})`);
    if (APPLY) {
      await prisma.server.update({
        where: { id: s.id },
        data: { passwordEnc: enc, password: "" },
      });
    }
  }

  console.log(
    APPLY
      ? `\nDone — ${pending.length} server password(s) encrypted. ✅`
      : `\nDry run. Re-run with --apply to write the changes.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
