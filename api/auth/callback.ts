import { normalizeHandle } from '../_lib/store.js'
import { clearOAuthStateCookie, createSessionCookie, readOAuthStateCookie } from '../_lib/session.js'

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} not configured`)
  return value
}

function callbackUrl(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}/api/auth/callback`
}

function appOrigin(request: Request): string {
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const origin = appOrigin(request)
  const fail = () => Response.redirect(`${origin}/?auth_error=1`, 302)

  const saved = await readOAuthStateCookie(request)
  if (!code || !state || !saved || saved.state !== state) {
    return fail()
  }

  const clientId = requiredEnv('X_CLIENT_ID')
  const clientSecret = requiredEnv('X_CLIENT_SECRET')
  const basicAuth = btoa(`${clientId}:${clientSecret}`)

  try {
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl(request),
        code_verifier: saved.verifier,
        client_id: clientId,
      }),
    })
    if (!tokenRes.ok) {
      console.error('oauth token exchange failed:', tokenRes.status, await tokenRes.text())
      return fail()
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string }
    if (!tokenJson.access_token) return fail()

    const meRes = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    })
    if (!meRes.ok) {
      console.error('oauth users/me failed:', meRes.status, await meRes.text())
      return fail()
    }
    const meJson = (await meRes.json()) as { data?: { username?: string } }
    if (!meJson.data?.username) return fail()

    const handle = normalizeHandle(meJson.data.username)
    const headers = new Headers({ Location: `${origin}/` })
    headers.append('Set-Cookie', await createSessionCookie(handle))
    headers.append('Set-Cookie', clearOAuthStateCookie())
    return new Response(null, { status: 302, headers })
  } catch (err) {
    console.error('oauth callback failed:', err)
    return fail()
  }
}
