import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getCurrentUser, hashPassword } from "@/lib/auth"

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser()
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}

  if (typeof body.name === "string") data.name = body.name.trim()
  if (body.role === "admin" || body.role === "operator") data.role = body.role
  if (typeof body.isActive === "boolean") data.isActive = body.isActive
  if (typeof body.password === "string" && body.password.length >= 6) {
    data.passwordHash = hashPassword(body.password)
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, name: true, role: true, isActive: true },
  })
  return NextResponse.json({ user })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser()
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await ctx.params
  if (id === me.id) {
    return NextResponse.json({ error: "Tidak bisa hapus akun sendiri" }, { status: 400 })
  }

  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
