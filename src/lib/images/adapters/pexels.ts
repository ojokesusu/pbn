import type { ImageAdapter, ImageContext, ImageResult } from '../types'

let warnedMissingKey = false

function warnMissingKeyOnce() {
  if (warnedMissingKey) return
  warnedMissingKey = true
  console.warn('[images/pexels] PEXELS_API_KEY not set; adapter disabled')
}

export const pexelsAdapter: ImageAdapter = {
  key: 'pexels',
  async fetch(ctx: ImageContext): Promise<ImageResult | null> {
    const key = process.env.PEXELS_API_KEY
    if (!key) {
      if (process.env.NODE_ENV === 'production') {
        warnMissingKeyOnce()
      }
      return null
    }

    const query = ctx.query || ctx.niche
    if (!query) {
      return null
    }

    const params = new URLSearchParams({
      query,
      per_page: '1',
      orientation: 'landscape',
    })
    const url = `https://api.pexels.com/v1/search?${params.toString()}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: key,
        },
        signal: controller.signal,
      })

      if (!res.ok) {
        console.warn(`[images/pexels] non-200 response: ${res.status} ${res.statusText}`)
        return null
      }

      const data = (await res.json()) as {
        photos?: Array<{
          src?: { large?: string }
          photographer?: string
        }>
      }

      const first = data.photos?.[0]
      const photoUrl = first?.src?.large
      const photographer = first?.photographer

      if (!first || !photoUrl) {
        return null
      }

      const attributionName = photographer || 'Pexels'

      return {
        url: photoUrl,
        attribution: `Foto: ${attributionName} / Pexels`,
        sourceLabel: 'Pexels',
        width: 1280,
        height: 853,
      }
    } catch (err) {
      console.warn('[images/pexels] fetch failed:', err instanceof Error ? err.message : err)
      return null
    } finally {
      clearTimeout(timeout)
    }
  },
}
