import { scryptSync, randomBytes, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { prisma } from "./db"

export const SESSION_COOKIE = "pbn_session"
const SESSION_DAYS = 7

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const derived = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${derived}`
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

// API route helper — returns a 403 NextResponse if the current user is not
// admin, otherwise null. Usage at the top of a handler:
//   const denied = await denyIfNotAdmin(); if (denied) return denied;
export async function denyIfNotAdmin() {
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
