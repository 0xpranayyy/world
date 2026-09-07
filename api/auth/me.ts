import { readSession } from '../_lib/session.js'

export async function GET(request: Request): Promise<Response> {
  const session = await readSession(request)
  return Response.json(
    session ? { email: session.email, name: session.name } : { email: null, name: null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
