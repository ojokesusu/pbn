// IP geolocation via ip-api.com (free tier, no API key needed, HTTP only).
// Rate limit: 45 req/min per public IP — plenty for a dashboard login flow.
// Docs: https://ip-api.com/docs/api:json

export type GeoInfo = {
  country: string
  countryCode: string
  city: string
  region: string
}

const EMPTY: GeoInfo = { country: "", countryCode: "", city: "", region: "" }
const LOCAL: GeoInfo = { country: "Local", countryCode: "", city: "", region: "" }

// RFC1918 + loopback detection — skip these to save API quota.
function isPrivateOrLocal(ip: string): boolean {
  if (!ip || ip === "unknown") return true
  if (ip === "127.0.0.1" || ip === "::1" || ip.toLowerCase() === "localhost") return true
  if (ip.startsWith("10.")) return true
  if (ip.startsWith("192.168.")) return true
  const m = ip.match(/^172\.(\d+)\./)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n >= 16 && n <= 31) return true
  }
  // IPv6 unique-local + link-local
  const lower = ip.toLowerCase()
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:")) return true
  return false
}

// Convert ISO 3166-1 alpha-2 country code → flag emoji (e.g. "ID" → 🇮🇩).
// Uses regional indicator symbols (Unicode U+1F1E6..U+1F1FF).
export function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return ""
  const upper = code.toUpperCase()
  const chars = [...upper].map((c) => 127397 + c.charCodeAt(0))
  return String.fromCodePoint(...chars)
}

// Lookup an IP's location. Returns empty info on timeout/error — never throws,
// never blocks caller for more than ~1.5s.
export async function geolocateIP(ip: string): Promise<GeoInfo> {
  if (isPrivateOrLocal(ip)) return LOCAL

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 1500)

  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,region,regionName,city`
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" })
    if (!res.ok) return EMPTY
    const data = await res.json()
    if (data.status !== "success") return EMPTY
    return {
      country: String(data.country || ""),
      countryCode: String(data.countryCode || ""),
      city: String(data.city || ""),
      region: String(data.regionName || data.region || ""),
    }
  } catch {
    return EMPTY
  } finally {
    clearTimeout(timeoutId)
  }
}
