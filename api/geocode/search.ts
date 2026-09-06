import { checkRateLimit } from '../_lib/rateLimit.js'
import { searchPlaces } from '../_lib/geocode.js'

// Cache search results for a while: the same handful of city names get
// searched over and over across all visitors, so this both takes load off
// Nominatim and makes repeat searches feel instant.
const cacheHeaders = { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' }
const noStore = { 'Cache-Control': 'no-store' }

export async function GET(request: Request): Promise<Response> {
  const rate = await checkRateLimit(request, { key: 'geocode-search', limit: 30, windowMs: 60 * 1000 })
  if (!rate.allowed) {
    return Response.json(
      { error: 'too many searches, slow down' },
      { status: 429, headers: { ...noStore, 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (query.length < 2) return Response.json([], { headers: cacheHeaders })

  try {
    const hits = await searchPlaces(query)
    return Response.json(hits, { headers: cacheHeaders })
  } catch (err) {
    console.error('GET /api/geocode/search failed:', err)
    return Response.json({ error: 'search unavailable' }, { status: 503, headers: noStore })
  }
}
