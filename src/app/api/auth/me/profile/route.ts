import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  getCurrentUser,
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
} from "@/lib/auth"
import { AVATAR_PRESETS } from "@/lib/avatars"

// PATCH /api/auth/me/profile
// Allows the current user to update their own username, password, name, or avatar.
// Username/password changes require currentPassword for verification.
export async function PATCH(req: Request) {
  const me = await getCurrentUser()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { currentPassword, newUsername, newPassword, name, avatarId } = body as {
    currentPassword?: string
    newUsername?: string
    newPassword?: string
    name?: string
    avatarId?: string
  }

  const wantsSensitiveChange = !!newUsername || !!newPassword
  if (wantsSensitiveChange) {
    if (!currentPassword) {
      return NextResponse.json(
        { error: "Password saat ini wajib diisi untuk ganti username/password" },
        { status: 400 }
      )
    }
    // Re-fetch full user to verify password
    const full = await prisma.user.findUnique({ where: { id: me.id } })
    if (!full || !verifyPassword(currentPassword, full.passwordHash)) {
      return NextResponse.json(
        { error: "Password saat ini salah" },
        { status: 401 }
      )
    }
  }

  const data: Record<string, string> = {}

  if (typeof name === "string") {
    data.name = name.trim()
  }

  if (typeof avatarId === "string") {
    if (avatarId === "") {
      data.avatarId = ""
    } else if (AVATAR_PRESETS.some((a) => a.id === avatarId)) {
      data.avatarId = avatarId
    } else {
      return NextResponse.json({ error: "Avatar ID tidak valid" }, { status: 400 })
    }
  }

  if (newUsername) {
    const u = newUsername.trim()
    if (u.length < 3) {
      return NextResponse.json({ error: "Username minimal 3 karakter" }, { status: 400 })
    }
    if (u !== me.username) {
      const exists = await prisma.user.findUnique({ where: { username: u } })
      if (exists) {
        return NextResponse.json({ error: "Username sudah dipakai" }, { status: 400 })
      }
      data.username = u
    }
  }

  if (newPassword) {
    const pwError = validatePasswordStrength(newPassword)
    if (pwError) return NextResponse.json({ error: pwError }, { status: 400 })
    data.passwordHash = hashPassword(newPassword)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 })
  }

  const updated = await prisma.user.update({
    where: { id: me.id },
    data,
    select: { id: true, username: true, name: true, role: true, avatarId: true },
  })

  return NextResponse.json({ user: updated })
}
