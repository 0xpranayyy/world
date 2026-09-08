import { checkRateLimit } from './_lib/rateLimit.js'
import { readSession } from './_lib/session.js'
import { addPin, readPins } from './_lib/store.js'

const noStore = { 'Cache-Control': 'no-store' }
// Clients poll this endpoint every few seconds; a short CDN-cacheable window
// lets a burst of concurrent pollers share one edge-cached response instead
// of each hitting the database directly, without meaningfully affecting how
// fresh the pin list feels.
//
// A plain `Cache-Control` here does not survive: production was observed
// returning `max-age=0, must-revalidate` no matter what this said, so the
// edge never cached and every poll from every tab reached Postgres. The
// CDN-specific headers are the ones the platform honours. The browser is
// deliberately told to revalidate every time -- paired with the ETag below
// that costs a 304 with no body rather than a full re-download.
const edgeCache = 'public, s-maxage=2, stale-while-revalidate=8'
const shortCache = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'CDN-Cache-Control': edgeCache,
  'Vercel-CDN-Cache-Control': edgeCache,
}

async function etagFor(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(body))
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `W/"${hex}"`
}

export async function GET(request: Request): Promise<Response> {
  try {
    const pins = await readPins()
    const body = JSON.stringify(pins)
    const etag = await etagFor(body)
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { ...shortCache, ETag: etag } })
    }
    return new Response(body, {
      headers: { ...shortCache, ETag: etag, 'Content-Type': 'application/json; charset=utf-8' },
    })
  } catch (err) {
    console.error('GET /api/pins failed:', err)
    return Response.json({ error: 'pins unavailable' }, { status: 503, headers: noStore })
  }
}

export async function POST(request: Request): Promise<Response> {
  // The pin's Google identity comes from the caller's verified session,
  // never from the request body -- otherwise anyone could claim to be
  // whoever they typed. The displayed handle is still free text, just no
  // longer what proves ownership.
  const session = await readSession(request)
  if (!session) {
    return Response.json({ error: 'sign in with Google to drop a pin' }, { status: 401, headers: noStore })
  }

  // Deliberately loose, because the IP is a poor identity here and a strict
  // limit hurts the wrong people. Mobile carriers put thousands of users
  // behind one address (CGNAT), so a tight per-IP cap rejects real visitors
  // who simply share a network with someone who just pinned -- precisely what
  // a launch spike looks like.
  //
  // Abuse is already bounded by something far better: a pin requires a Google
  // session, and google_sub carries a UNIQUE constraint, so one account can
  // only ever hold one pin. An attacker needs a fresh Google account per pin
  // regardless of address. What's left for this limit to do is blunt
  // resource exhaustion, which a high ceiling handles fine.
  const rate = await checkRateLimit(request, { key: 'add-pin', limit: 100, windowMs: 10 * 60 * 1000 })
  if (!rate.allowed) {
    return Response.json(
      { error: 'too many pins from this address, try again later' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(rate.retryAfterSeconds) } },
    )
  }

  let draft: unknown
  try {
    draft = await request.json()
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400, headers: noStore })
  }
  if (typeof draft !== 'object' || draft === null) {
    return Response.json({ error: 'invalid pin' }, { status: 400, headers: noStore })
  }
  const d = draft as Record<string, unknown>
  try {
    const result = await addPin({
      handle: typeof d.handle === 'string' ? d.handle : '',
      locationName: typeof d.locationName === 'string' ? d.locationName : '',
      lat: typeof d.lat === 'number' ? d.lat : Number(d.lat),
      lng: typeof d.lng === 'number' ? d.lng : Number(d.lng),
      googleSub: session.sub,
    })
    if ('pin' in result) {
      return Response.json(result.pin, { status: 201, headers: noStore })
    }
    return Response.json(
      { error: result.error, handle: result.handle },
      { status: result.status, headers: noStore },
    )
  } catch (err) {
    console.error('POST /api/pins failed:', err)
    return Response.json({ error: 'could not save pin' }, { status: 503, headers: noStore })
  }
}
