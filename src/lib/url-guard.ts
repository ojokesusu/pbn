// ── SSRF guard ──
// Validates a user-supplied URL before the server fetches it, to block
// Server-Side Request Forgery against internal/cloud-metadata targets
// (e.g. http://169.254.169.254/, localhost, RFC1918 private ranges).
//
// Usage:
//   const url = await assertPublicHttpUrl(userInput); // throws on unsafe
//   const res = await fetch(url);
//
// Note: this resolves DNS and checks the resolved IPs. There is a small
// time-of-check/time-of-use gap (DNS could change between check and fetch),
// but this still blocks the overwhelming majority of SSRF attempts and is a
// large improvement over fetching arbitrary user input unchecked.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0) return true; // "this" network
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice("::ffff:".length)); // v4-mapped
  return false;
}

/**
 * Returns a validated URL safe to fetch from the server, or throws an Error
 * (with an Indonesian message) if the URL is missing, malformed, non-http(s),
 * or resolves to an internal/private/metadata address.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL tidak valid");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Hanya URL http/https yang diizinkan");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("URL menuju alamat internal ditolak");
  }

  let ips: string[];
  if (isIP(host)) {
    ips = [host];
  } else {
    try {
      const records = await lookup(host, { all: true });
      ips = records.map((r) => r.address);
    } catch {
      throw new Error("Host tidak dapat diselesaikan (DNS gagal)");
    }
  }

  if (ips.length === 0) throw new Error("Host tidak dapat diselesaikan");
  for (const ip of ips) {
    if (isPrivateIp(ip)) {
      throw new Error("URL menuju alamat internal/privat ditolak");
    }
  }

  return url;
}
