import { checkRateLimit } from '../_lib/rateLimit.js'
import { reverseGeocodePlace } from '../_lib/geocode.js'

const cacheHeaders = { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=600' }
const noStore = { 'Cache-Control': 'no-store' }

export async function GET(request: Request): Promise<Response> {
  const rate = await checkRateLimit(request, { key: 'geocode-reverse', limit: 20, windowMs: 60 * 1000 })
  if (!rate.allowed) {
    return Response.json(
      { error: 'too many requests, slow down' },
      { status: 429, headers: { ...noStore, 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  const params = new URL(request.url).searchParams
  const lat = Number(params.get('lat'))
  const lng = Number(params.get('lng'))
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ error: 'lat and lng required' }, { status: 400, headers: noStore })
  }

  try {
    const hit = await reverseGeocodePlace(lat, lng)
    return Response.json(hit, { headers: cacheHeaders })
  } catch (err) {
    console.error('GET /api/geocode/reverse failed:', err)
    return Response.json({ error: 'reverse geocode unavailable' }, { status: 503, headers: noStore })
  }
}
