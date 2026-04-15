"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export type Me = {
  id: string
  username: string
  name: string
  role: "admin" | "operator"
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data) => {
        if (!cancelled) {
          setMe(data.user)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { me, loading }
}

// Redirects non-admin users to the dashboard home.
// Returns { me, loading, isAdmin } — page should render a fallback while loading.
export function useAdminGuard() {
  const { me, loading } = useMe()
  const router = useRouter()
  const isAdmin = me?.role === "admin"

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.replace("/")
    }
  }, [loading, isAdmin, router])

  return { me, loading, isAdmin }
}
