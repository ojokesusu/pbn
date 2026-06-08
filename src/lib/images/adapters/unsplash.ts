import type { ImageAdapter, ImageContext, ImageResult } from '../types'

let warnedMissingKey = false

function warnMissingKeyOnce() {
  if (warnedMissingKey) return
  warnedMissingKey = true
  console.warn('[images/unsplash] UNSPLASH_ACCESS_KEY not set; adapter disabled')
}

export const unsplashAdapter: ImageAdapter = {
  key: 'unsplash',
  async fetch(ctx: ImageContext): Promise<ImageResult | null> {
    const key = process.env.UNSPLASH_ACCESS_KEY
    if (!key) {
      if (process.env.NODE_ENV === 'production') {
        warnMissingKeyOnce()
      }
      return null
    }

    const query = ctx.query || ctx.niche || 'news indonesia'
    // slotIndex (0-indexed) -> page (1-indexed). Lets the picker request
    // a different page for slot 2 so we don't render the same photo twice.
    const page = (ctx.slotIndex ?? 0) + 1
    const params = new URLSearchParams({
      query,
      per_page: '1',
      page: String(page),
      orientation: 'landscape',
      content_filter: 'high',
    })
    const url = `https://api.unsplash.com/search/photos?${params.toString()}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Client-ID ${key}`,
          'Accept-Version': 'v1',
        },
        signal: controller.signal,
      })

      if (!res.ok) {
        console.warn(`[images/unsplash] non-200 response: ${res.status} ${res.statusText}`)
        return null
      }

      const data = (await res.json()) as {
        results?: Array<{
          urls?: { regular?: string }
          user?: { name?: string }
        }>
      }

      const first = data.results?.[0]
      const photoUrl = first?.urls?.regular
      const userName = first?.user?.name

      if (!first || !photoUrl) {
        return null
      }

      const attributionName = userName || 'Unsplash'

      return {
        url: photoUrl,
        attribution: `Foto: ${attributionName} / Unsplash`,
        sourceLabel: 'Unsplash',
        width: 1080,
        height: 720,
      }
    } catch (err) {
      console.warn('[images/unsplash] fetch failed:', err instanceof Error ? err.message : err)
      return null
    } finally {
      clearTimeout(timeout)
    }
  },
}
