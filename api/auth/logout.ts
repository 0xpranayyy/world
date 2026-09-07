import { clearSessionCookie } from '../_lib/session.js'

export async function POST(): Promise<Response> {
  return Response.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': clearSessionCookie() } },
  )
}
