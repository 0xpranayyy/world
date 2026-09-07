import { readSession } from '../_lib/session.js'

export async function GET(request: Request): Promise<Response> {
  const session = await readSession(request)
  return Response.json(
    { handle: session?.handle ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
