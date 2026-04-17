"use client"

import { AVATAR_PRESETS } from "@/lib/avatars"
import { Check, X } from "lucide-react"

interface AvatarPickerProps {
  value?: string | null
  onChange: (id: string) => void
  onClose?: () => void
}

// Grid picker for the 15 preset avatars. Animal + Gaming categories.
// User clicks to select → onChange is called with the id.
export function AvatarPicker({ value, onChange, onClose }: AvatarPickerProps) {
  const animals = AVATAR_PRESETS.filter((a) => a.category === "animal")
  const gaming = AVATAR_PRESETS.filter((a) => a.category === "gaming")

  return (
    <div className="space-y-4">
      {/* Animal section */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
          🐾 Animal
        </h4>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {animals.map((a) => {
            const selected = value === a.id
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onChange(a.id)}
                className="relative w-12 h-12 rounded-full transition-all hover:scale-110"
                style={{
                  background: a.bg,
                  boxShadow: selected
                    ? "0 0 0 3px rgba(14,165,233,0.5), 0 4px 12px rgba(0,0,0,0.15)"
                    : "0 2px 6px rgba(0,0,0,0.1)",
                }}
                title={a.label}
              >
                <span className="text-2xl" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}>
                  {a.emoji}
                </span>
                {selected && (
                  <span
                    className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: "#0ea5e9", border: "2px solid white" }}
                  >
                    <Check className="size-3 text-white" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Gaming section */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted-foreground)" }}>
          🎮 Gaming
        </h4>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {gaming.map((a) => {
            const selected = value === a.id
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onChange(a.id)}
                className="relative w-12 h-12 rounded-full transition-all hover:scale-110"
                style={{
                  background: a.bg,
                  boxShadow: selected
                    ? "0 0 0 3px rgba(14,165,233,0.5), 0 4px 12px rgba(0,0,0,0.15)"
                    : "0 2px 6px rgba(0,0,0,0.1)",
                }}
                title={a.label}
              >
                <span className="text-2xl" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}>
                  {a.emoji}
                </span>
                {selected && (
                  <span
                    className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: "#0ea5e9", border: "2px solid white" }}
                  >
                    <Check className="size-3 text-white" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Clear avatar option */}
      <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-muted inline-flex items-center gap-1.5"
          style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
        >
          <X className="size-3" />
          Hapus avatar (pakai huruf default)
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg ml-auto"
            style={{ background: "#0ea5e9", color: "#ffffff" }}
          >
            Tutup
          </button>
        )}
      </div>
    </div>
  )
}
