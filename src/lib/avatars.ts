// ── Avatar registry ──
// 15 preset avatars (animal + gaming theme) with emoji + gradient background.
// Each preset has a stable `id` stored in User.avatarId so we can render
// consistently across the app without syncing images.

export type AvatarPreset = {
  id: string;
  label: string;
  emoji: string;
  bg: string;       // CSS background (usually gradient)
  category: "animal" | "gaming";
};

export const AVATAR_PRESETS: AvatarPreset[] = [
  // ── Animals (8) ──
  { id: "fox",      label: "Fox",      emoji: "🦊", bg: "linear-gradient(135deg, #f97316, #fbbf24)", category: "animal" },
  { id: "lion",     label: "Lion",     emoji: "🦁", bg: "linear-gradient(135deg, #eab308, #d97706)", category: "animal" },
  { id: "tiger",    label: "Tiger",    emoji: "🐯", bg: "linear-gradient(135deg, #f97316, #dc2626)", category: "animal" },
  { id: "wolf",     label: "Wolf",     emoji: "🐺", bg: "linear-gradient(135deg, #64748b, #334155)", category: "animal" },
  { id: "panda",    label: "Panda",    emoji: "🐼", bg: "linear-gradient(135deg, #94a3b8, #475569)", category: "animal" },
  { id: "owl",      label: "Owl",      emoji: "🦉", bg: "linear-gradient(135deg, #6366f1, #1e3a8a)", category: "animal" },
  { id: "eagle",    label: "Eagle",    emoji: "🦅", bg: "linear-gradient(135deg, #a16207, #422006)", category: "animal" },
  { id: "shark",    label: "Shark",    emoji: "🦈", bg: "linear-gradient(135deg, #0ea5e9, #0c4a6e)", category: "animal" },

  // ── Gaming (7) ──
  { id: "gamepad",  label: "Gamepad",  emoji: "🎮", bg: "linear-gradient(135deg, #a855f7, #6b21a8)", category: "gaming" },
  { id: "joystick", label: "Joystick", emoji: "🕹️", bg: "linear-gradient(135deg, #ef4444, #7f1d1d)", category: "gaming" },
  { id: "alien",    label: "Alien",    emoji: "👾", bg: "linear-gradient(135deg, #22c55e, #14532d)", category: "gaming" },
  { id: "target",   label: "Target",   emoji: "🎯", bg: "linear-gradient(135deg, #06b6d4, #0e7490)", category: "gaming" },
  { id: "swords",   label: "Swords",   emoji: "⚔️", bg: "linear-gradient(135deg, #64748b, #0f172a)", category: "gaming" },
  { id: "trophy",   label: "Trophy",   emoji: "🏆", bg: "linear-gradient(135deg, #facc15, #a16207)", category: "gaming" },
  { id: "fire",     label: "Fire",     emoji: "🔥", bg: "linear-gradient(135deg, #f97316, #7c2d12)", category: "gaming" },
];

// Default: teal-lime gradient with first letter of name.
// Used when user.avatarId is empty (new user, or cleared).
export const DEFAULT_AVATAR = {
  bg: "linear-gradient(135deg, #0ea5e9, #84cc16)",
  bgOperator: "linear-gradient(135deg, #64748b, #334155)",
};

export function getAvatar(id?: string | null): AvatarPreset | null {
  if (!id) return null;
  return AVATAR_PRESETS.find((a) => a.id === id) ?? null;
}
