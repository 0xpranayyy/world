import { useEffect, useState } from 'react'
import type { GeoSuggestion } from '../types'

type NominatimHit = {
  place_id: number
  display_name: string
  lat: string
  lon: string
}

export function useNominatim(query: string): {
  suggestions: GeoSuggestion[]
  loading: boolean
} {
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setSuggestions([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      const url = new URL('https://nominatim.openstreetmap.org/search')
      url.searchParams.set('format', 'jsonv2')
      url.searchParams.set('limit', '5')
      url.searchParams.set('q', trimmed)

      void fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('geocode failed')
          return (await res.json()) as NominatimHit[]
        })
        .then((hits) => {
          setSuggestions(
            hits.slice(0, 5).map((hit) => ({
              id: String(hit.place_id),
              displayName: hit.display_name,
              lat: Number(hit.lat),
              lng: Number(hit.lon),
            })),
          )
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setSuggestions([])
        })
        .finally(() => setLoading(false))
    }, 400)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  return { suggestions, loading }
}
