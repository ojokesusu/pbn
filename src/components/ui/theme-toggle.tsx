"use client"

import { useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setIsDark(document.documentElement.classList.contains("dark"))
  }, [])

  function toggle() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle("dark", next)
    try {
      localStorage.setItem("theme", next ? "dark" : "light")
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={mounted && isDark ? "Mode terang" : "Mode gelap"}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10"
    >
      {mounted && isDark ? (
        <Sun className="size-[18px]" style={{ color: "#fbbf24" }} />
      ) : (
        <Moon className="size-[18px]" style={{ color: "#64748b" }} />
      )}
      <span className="sr-only">Toggle tema</span>
    </button>
  )
}
