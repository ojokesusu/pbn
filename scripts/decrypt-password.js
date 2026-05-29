#!/usr/bin/env node
/**
 * decrypt-password.js — CLI helper invoked by worker_daemon.py via subprocess.
 *
 * Usage:
 *   PROVISION_PASSWORD_KEY=<64-hex> node scripts/decrypt-password.js <base64-blob>
 *
 * Writes the plaintext password to stdout (no trailing newline). Exits non-zero
 * on hard errors (missing arg, malformed key). Falls back to legacy base64
 * decode when the AES path fails or the env key is missing — this matches
 * decryptPasswordOrLegacy() in src/lib/crypto.ts so rows created before the
 * AES migration keep working until they are reissued.
 *
 * MUST mirror the algorithm parameters used by src/lib/crypto.ts:
 *   AES-256-GCM, IV=12 bytes, TAG=16 bytes, wire = base64(iv || tag || ct).
 */

const crypto = require("node:crypto");

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const KEY_HEX_LENGTH = KEY_LENGTH * 2;

const blob = process.argv[2];
if (!blob) {
  process.stderr.write("decrypt-password.js: missing blob argument\n");
  process.exit(2);
}

function tryAes(b64, keyHex) {
  if (!keyHex) return null;
  if (keyHex.length !== KEY_HEX_LENGTH) return null;
  if (!/^[0-9a-fA-F]+$/.test(keyHex)) return null;

  let raw;
  try {
    raw = Buffer.from(b64, "base64");
  } catch {
    return null;
  }
  if (raw.length < IV_LENGTH + TAG_LENGTH + 1) return null;

  try {
    const key = Buffer.from(keyHex, "hex");
    const iv = raw.subarray(0, IV_LENGTH);
    const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

function legacyDecode(b64) {
  return Buffer.from(b64, "base64").toString("utf8");
}

const keyHex = process.env.PROVISION_PASSWORD_KEY || "";
const aes = tryAes(blob, keyHex);
const plaintext = aes !== null ? aes : legacyDecode(blob);
process.stdout.write(plaintext);
