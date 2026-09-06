import { useEffect, useState } from 'react'
import type { GeoSuggestion } from '../types'

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
      const url = new URL('/api/geocode/search', window.location.origin)
      url.searchParams.set('q', trimmed)

      void fetch(url, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error('geocode failed')
          return (await res.json()) as GeoSuggestion[]
        })
        .then(setSuggestions)
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
