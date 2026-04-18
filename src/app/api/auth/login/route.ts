import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { verifyPassword, createSession } from "@/lib/auth"
import { geolocateIP, type GeoInfo } from "@/lib/geoip"

// ── Brute-force protection settings ──
const IP_RATE_WINDOW_MS = 15 * 60 * 1000  // 15 minutes
const IP_RATE_MAX_FAILS = 5               // max failed attempts per IP per window
const ACCOUNT_LOCK_THRESHOLD = 10         // failed attempts before account lock
const ACCOUNT_LOCK_DURATION_MS = 60 * 60 * 1000  // 1 hour lock

function getClientIp(req: Request): string {
  // Trust first hop in x-forwarded-for (Railway/Vercel set this).
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  const real = req.headers.get("x-real-ip")
  if (real) return real
  return "unknown"
}

async function logAttempt(opts: {
  username: string
  ip: string
  userAgent: string
  success: boolean
  reason: string
  geo: GeoInfo
}) {
  try {
    const { geo, ...rest } = opts
    await prisma.loginAttempt.create({
      data: {
        ...rest,
        country: geo.country,
        countryCode: geo.countryCode,
        city: geo.city,
        region: geo.region,
      },
    })
  } catch {
    // Non-critical — don't block login on logging failure
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const userAgent = req.headers.get("user-agent") || ""
  const { username, password } = await req.json().catch(() => ({}))

  // Kick off geolocation in parallel with DB queries below to hide ~200ms latency.
  // Never throws, returns empty info on timeout/error.
  const geoPromise = geolocateIP(ip)

  if (!username || !password) {
    return NextResponse.json({ error: "Username dan password wajib diisi" }, { status: 400 })
  }

  const cleanUsername = String(username).trim()

  // ── 1. IP rate limit check ──
  const recentIpFails = await prisma.loginAttempt.count({
    where: {
      ip,
      success: false,
      createdAt: { gte: new Date(Date.now() - IP_RATE_WINDOW_MS) },
    },
  })
  if (recentIpFails >= IP_RATE_MAX_FAILS) {
    const geo = await geoPromise
    await logAttempt({ username: cleanUsername, ip, userAgent, success: false, reason: "rate_limited", geo })
    return NextResponse.json(
      {
        error: `Terlalu banyak percobaan login dari IP ini. Tunggu 15 menit lalu coba lagi.`,
      },
      { status: 429 }
    )
  }

  // ── 2. Look up user ──
  const user = await prisma.user.findUnique({ where: { username: cleanUsername } })

  if (!user) {
    const geo = await geoPromise
    await logAttempt({ username: cleanUsername, ip, userAgent, success: false, reason: "user_not_found", geo })
    // Same error message as wrong password to avoid username enumeration
    return NextResponse.json({ error: "Username atau password salah" }, { status: 401 })
  }

  if (!user.isActive) {
    const geo = await geoPromise
    await logAttempt({ username: cleanUsername, ip, userAgent, success: false, reason: "inactive", geo })
    return NextResponse.json({ error: "Akun ini dinonaktifkan. Hubungi admin." }, { status: 403 })
  }

  // ── 3. Account lock check ──
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const geo = await geoPromise
    await logAttempt({ username: cleanUsername, ip, userAgent, success: false, reason: "locked", geo })
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
    return NextResponse.json(
      {
        error: `Akun dikunci karena terlalu banyak percobaan gagal. Coba lagi dalam ${minutesLeft} menit.`,
      },
      { status: 423 }
    )
  }

  // ── 4. Password check ──
  if (!verifyPassword(String(password), user.passwordHash)) {
    const newFailCount = user.failedLoginCount + 1
    const shouldLock = newFailCount >= ACCOUNT_LOCK_THRESHOLD
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: newFailCount,
        lockedUntil: shouldLock ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS) : null,
      },
    })
    const geo = await geoPromise
    await logAttempt({
      username: cleanUsername,
      ip,
      userAgent,
      success: false,
      reason: shouldLock ? "wrong_password_locked" : "wrong_password",
      geo,
    })
    if (shouldLock) {
      return NextResponse.json(
        { error: `Akun dikunci 1 jam karena ${ACCOUNT_LOCK_THRESHOLD} percobaan gagal.` },
        { status: 423 }
      )
    }
    const remaining = ACCOUNT_LOCK_THRESHOLD - newFailCount
    return NextResponse.json(
      { error: `Username atau password salah. Sisa percobaan: ${remaining}` },
      { status: 401 }
    )
  }

  // ── 5. Success — reset counters and create session ──
  await createSession(user.id)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    },
  })
  const geo = await geoPromise
  await logAttempt({ username: cleanUsername, ip, userAgent, success: true, reason: "ok", geo })

  return NextResponse.json({
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
  })
}
