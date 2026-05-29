/**
 * Symmetric encryption for SSH passwords stored in ProvisionTask.sshPassEnc.
 *
 * Algorithm: AES-256-GCM
 *   - Key: 32 bytes (256 bits), supplied via PROVISION_PASSWORD_KEY as 64-char hex
 *   - IV:  12 bytes random per-message (NIST-recommended GCM IV length)
 *   - Tag: 16 bytes authentication tag (AEAD integrity)
 *
 * Wire format (single base64 blob): iv(12) || tag(16) || ciphertext
 *
 * Key generation (run once, store the hex output in both Railway and the RDP env):
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Environment variable PROVISION_PASSWORD_KEY MUST be set identically in:
 *   1. Railway (Next.js API encrypts here on batch create)
 *   2. RDP environment that runs worker_daemon.py (decrypts here at provision time)
 * A mismatch will surface as "Unsupported state or unable to authenticate data"
 * on the GCM tag verification step.
 *
 * Migration safety: decryptPasswordOrLegacy() falls back to plain base64 decode
 * (the previous obfuscation scheme) so existing rows keep working until they
 * are reissued. Remove the fallback once the table has been re-encrypted.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256-bit key
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_HEX_LENGTH = KEY_LENGTH * 2; // 64 hex chars

function getKey(): Buffer {
  const hex = process.env.PROVISION_PASSWORD_KEY;
  if (!hex) {
    throw new Error(
      "PROVISION_PASSWORD_KEY env var is not set. Generate one with: " +
        `node -e "console.log(require('crypto').randomBytes(${KEY_LENGTH}).toString('hex'))"`
    );
  }
  if (hex.length !== KEY_HEX_LENGTH) {
    throw new Error(
      `PROVISION_PASSWORD_KEY must be exactly ${KEY_HEX_LENGTH} hex characters ` +
        `(${KEY_LENGTH} bytes); got ${hex.length} chars.`
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("PROVISION_PASSWORD_KEY must be hex (0-9, a-f).");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a plaintext password using AES-256-GCM.
 * Returns base64(iv || tag || ciphertext).
 */
export function encryptPassword(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new TypeError("encryptPassword: plaintext must be a string");
  }
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  if (tag.length !== TAG_LENGTH) {
    throw new Error(`Unexpected GCM tag length: ${tag.length}`);
  }
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * Decrypts a blob produced by encryptPassword().
 * Throws if the key is missing, the blob is malformed, or the auth tag fails.
 */
export function decryptPassword(blob: string): string {
  if (typeof blob !== "string" || !blob) {
    throw new TypeError("decryptPassword: blob must be a non-empty string");
  }
  const key = getKey();
  const raw = Buffer.from(blob, "base64");
  if (raw.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error(
      `decryptPassword: blob too short (${raw.length} bytes) — expected >= ${
        IV_LENGTH + TAG_LENGTH + 1
      }`
    );
  }
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Tries AES-GCM decryption first; on any failure falls back to plain base64
 * decode (the legacy obfuscation scheme). Use during the migration window so
 * old ProvisionTask rows keep provisioning while new ones are encrypted.
 */
export function decryptPasswordOrLegacy(blob: string): string {
  if (typeof blob !== "string" || !blob) {
    throw new TypeError(
      "decryptPasswordOrLegacy: blob must be a non-empty string"
    );
  }
  // Heuristic: a real AES blob decodes to >= 28 raw bytes (12 iv + 16 tag).
  let raw: Buffer;
  try {
    raw = Buffer.from(blob, "base64");
  } catch {
    raw = Buffer.alloc(0);
  }
  if (raw.length >= IV_LENGTH + TAG_LENGTH + 1 && process.env.PROVISION_PASSWORD_KEY) {
    try {
      return decryptPassword(blob);
    } catch {
      // Fall through to legacy decode.
    }
  }
  // Legacy: the previous code did Buffer.from(plain, "utf8").toString("base64").
  // Reverse with Buffer.from(blob, "base64").toString("utf8").
  return Buffer.from(blob, "base64").toString("utf8");
}
