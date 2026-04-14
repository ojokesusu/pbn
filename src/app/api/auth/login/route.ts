import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { verifyPassword, createSession } from "@/lib/auth"

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}))

  if (!username || !password) {
    return NextResponse.json({ error: "Username dan password wajib diisi" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { username: String(username).trim() } })
  if (!user || !user.isActive || !verifyPassword(String(password), user.passwordHash)) {
    return NextResponse.json({ error: "Username atau password salah" }, { status: 401 })
  }

  await createSession(user.id)
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

  return NextResponse.json({
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
  })
}
