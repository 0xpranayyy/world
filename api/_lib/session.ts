const encoder = new TextEncoder()
const decoder = new TextDecoder()

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export function randomToken(byteLength = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)))
}

export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input))
  return base64UrlEncode(new Uint8Array(digest))
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  return base64UrlEncode(new Uint8Array(sig))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function signValue(secret: string, payload: Record<string, unknown>): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const sig = await hmacSign(secret, body)
  return `${body}.${sig}`
}

async function verifyValue<T>(secret: string, token: string): Promise<T | null> {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = await hmacSign(secret, body)
  if (!timingSafeEqual(sig, expected)) return null
  try {
    return JSON.parse(decoder.decode(base64UrlDecode(body))) as T
  } catch {
    return null
  }
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get('cookie') ?? ''
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    if (!key) continue
    out[key] = decodeURIComponent(part.slice(idx + 1).trim())
  }
  return out
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ')
}

function clearedCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

function requireSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET not configured')
  return secret
}

// The Google account's stable, unique `sub` claim is the actual identity --
// email/name are carried along only for display, never used to key
// anything, since Google lets a user change their display name/email.
export type Session = { sub: string; email: string; name: string; iat: number }

const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export async function createSessionCookie(profile: { sub: string; email: string; name: string }): Promise<string> {
  const token = await signValue(requireSecret(), { ...profile, iat: Date.now() } satisfies Session)
  return serializeCookie(SESSION_COOKIE, token, SESSION_MAX_AGE)
}

export async function readSession(request: Request): Promise<Session | null> {
  const raw = parseCookies(request)[SESSION_COOKIE]
  if (!raw) return null
  return verifyValue<Session>(requireSecret(), raw)
}

export function clearSessionCookie(): string {
  return clearedCookie(SESSION_COOKIE)
}

// Short-lived cookie holding the PKCE verifier + CSRF state between
// /api/auth/login issuing the redirect and /api/auth/callback completing it.
export type OAuthState = { verifier: string; state: string }

const OAUTH_COOKIE = 'oauth_state'
const OAUTH_MAX_AGE = 60 * 10 // 10 minutes

export async function createOAuthStateCookie(data: OAuthState): Promise<string> {
  const token = await signValue(requireSecret(), data)
  return serializeCookie(OAUTH_COOKIE, token, OAUTH_MAX_AGE)
}

export async function readOAuthStateCookie(request: Request): Promise<OAuthState | null> {
  const raw = parseCookies(request)[OAUTH_COOKIE]
  if (!raw) return null
  return verifyValue<OAuthState>(requireSecret(), raw)
}

export function clearOAuthStateCookie(): string {
  return clearedCookie(OAUTH_COOKIE)
}
