import { addPin, readPins } from './_lib/store.js'

const noStore = { 'Cache-Control': 'no-store' }

export async function GET(): Promise<Response> {
  try {
    const pins = await readPins()
    return Response.json(pins, { headers: noStore })
  } catch (err) {
    console.error('GET /api/pins failed:', err)
    return Response.json({ error: 'pins unavailable' }, { status: 503, headers: noStore })
  }
}

export async function POST(request: Request): Promise<Response> {
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
