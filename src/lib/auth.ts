import { scryptSync, randomBytes, timingSafeEqual } from "crypto"
import { cookies, headers } from "next/headers"
import { NextResponse } from "next/server"
import { prisma } from "./db"

export const SESSION_COOKIE = "pbn_session"
const SESSION_DAYS = 7

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const derived = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${derived}`
}

// Enforce strong password rules for newly created users.
// Returns null if valid, or an error message string if invalid.
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 12) return "Password minimal 12 karakter"
  if (!/[A-Z]/.test(password)) return "Password harus mengandung huruf besar (A-Z)"
  if (!/[a-z]/.test(password)) return "Password harus mengandung huruf kecil (a-z)"
  if (!/[0-9]/.test(password)) return "Password harus mengandung angka (0-9)"
  if (!/[^A-Za-z0-9]/.test(password)) return "Password harus mengandung simbol (!@#$%, dst)"
  // Reject common weak patterns
  const weak = ["password", "123456", "admin", "qwerty", "letmein", "welcome"]
  const lower = password.toLowerCase()
  if (weak.some((w) => lower.includes(w))) return "Password terlalu umum/mudah ditebak"
  return null
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  const derived = scryptSync(password, salt, 64)
  const hashBuf = Buffer.from(hash, "hex")
  if (derived.length !== hashBuf.length) return false
  return timingSafeEqual(derived, hashBuf)
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  await prisma.session.create({
    data: { token, userId, expiresAt },
  })

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  })

  return token
}

export async function destroySession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    await prisma.session.deleteMany({ where: { token } }).catch(() => {})
    cookieStore.delete(SESSION_COOKIE)
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return null
  }

  const { passwordHash, ...user } = session.user
  void passwordHash
  return user
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("UNAUTHORIZED")
  return user
}

// Returns the current user if admin, otherwise null.
// API routes should check the return value and respond 403 if null.
export async function getAdminUser() {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") return null
  return user
}

// Service token check — header X-Service-Token must equal PROVISION_SERVICE_TOKEN env.
// Used by RDP worker (deploy_worker.py) to call admin-gated endpoints without a user
// session cookie. Empty/missing env disables service-token auth entirely (fail-closed).
async function isServiceTokenAuth(): Promise<boolean> {
  const expected = process.env.PROVISION_SERVICE_TOKEN
  if (!expected) return false
  try {
    const h = await headers()
    const got = h.get("x-service-token")
    if (!got || got.length !== expected.length) return false
    const a = Buffer.from(got)
    const b = Buffer.from(expected)
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// API route helper — returns a 403 NextResponse if the current user is not
// admin, otherwise null. Usage at the top of a handler:
//   const denied = await denyIfNotAdmin(); if (denied) return denied;
// Allows bypass via X-Service-Token header matching PROVISION_SERVICE_TOKEN env.
export async function denyIfNotAdmin() {
  if (await isServiceTokenAuth()) return null
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 })
  }
  return null
}

export async function ensureDefaultAdmin() {
  const count = await prisma.user.count()
  if (count > 0) return
  await prisma.user.create({
    data: {
      username: "admin",
      passwordHash: hashPassword("admin123"),
      name: "Administrator",
      role: "admin",
    },
  })
  console.log("[auth] Created default admin user: admin / admin123")
}
