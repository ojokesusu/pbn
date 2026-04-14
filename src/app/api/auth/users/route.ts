import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUser, hashPassword } from "@/lib/auth"

export async function GET() {
  const me = await getCurrentUser()
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  })
  return NextResponse.json({ users })
}

export async function POST(req: Request) {
  const me = await getCurrentUser()
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { username, password, name, role } = await req.json().catch(() => ({}))
  if (!username || !password) {
    return NextResponse.json({ error: "Username dan password wajib diisi" }, { status: 400 })
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: "Password minimal 6 karakter" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { username: String(username).trim() } })
  if (existing) {
    return NextResponse.json({ error: "Username sudah dipakai" }, { status: 400 })
  }

  const user = await prisma.user.create({
    data: {
      username: String(username).trim(),
      passwordHash: hashPassword(String(password)),
      name: String(name || "").trim(),
      role: role === "admin" ? "admin" : "operator",
    },
    select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
  })
  return NextResponse.json({ user })
}
