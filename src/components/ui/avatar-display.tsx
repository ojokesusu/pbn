"use client"

import { getAvatar, DEFAULT_AVATAR } from "@/lib/avatars"

interface AvatarDisplayProps {
  avatarId?: string | null
  name?: string
  username?: string
  role?: "admin" | "operator"
  size?: "sm" | "md" | "lg" | "xl"
  className?: string
}

const SIZE_MAP = {
  sm: { box: "w-7 h-7", text: "text-xs", emoji: "text-sm" },
  md: { box: "w-9 h-9", text: "text-sm", emoji: "text-lg" },
  lg: { box: "w-11 h-11", text: "text-base", emoji: "text-xl" },
  xl: { box: "w-16 h-16", text: "text-xl", emoji: "text-3xl" },
}

// Unified avatar renderer — shows emoji preset if avatarId set,
// otherwise falls back to the first letter of name/username with role-colored
// gradient background.
export function AvatarDisplay({
  avatarId,
  name,
  username,
  role = "admin",
  size = "md",
  className = "",
}: AvatarDisplayProps) {
  const preset = getAvatar(avatarId)
  const sz = SIZE_MAP[size]
  const initial = (name || username || "?").charAt(0).toUpperCase()
  const fallbackBg = role === "admin" ? DEFAULT_AVATAR.bg : DEFAULT_AVATAR.bgOperator

  return (
    <div
      className={`${sz.box} rounded-full flex items-center justify-center shrink-0 select-none text-white font-bold ${sz.text} ${className}`}
      style={{ background: preset?.bg ?? fallbackBg }}
    >
      {preset ? (
        <span className={sz.emoji} style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}>
          {preset.emoji}
        </span>
      ) : (
        initial
      )}
    </div>
  )
}
