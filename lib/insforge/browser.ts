'use client'

import { createBrowserClient } from '@insforge/sdk/ssr'
import { INSFORGE_ANON_KEY, INSFORGE_URL } from './config'

let client: ReturnType<typeof createBrowserClient> | null = null
let clientToken: string | null = null

// Session-aware browser client (reads the access-token cookie, refreshes via
// /api/auth/refresh). Auth mutations happen in Server Actions only, so the
// session cookie can change underneath us (sign in / sign out without a full
// reload) — rebuild the client whenever it does, never reuse a stale token.
export function browserClient() {
  const current = readAccessToken()
  if (!client || current !== clientToken) {
    client = createBrowserClient({ baseUrl: INSFORGE_URL, anonKey: INSFORGE_ANON_KEY })
    clientToken = current
  }
  return client
}

export function hasSessionCookie() {
  return typeof document !== 'undefined' && /(?:^|;\s*)insforge_access_token=/.test(document.cookie)
}

export function readAccessToken(): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(/(?:^|;\s*)insforge_access_token=([^;]+)/)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

function tokenExpiresSoon(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now() + 60_000
  } catch {
    return true
  }
}

// A valid access token for the signed-in user (refreshing it if needed), or
// null for guests. Sent to our edge functions, which verify it server-side.
export async function freshAccessToken(): Promise<string | null> {
  let token = readAccessToken()
  if (token && !tokenExpiresSoon(token)) return token
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    if (!res.ok) return null
  } catch {
    return null
  }
  token = readAccessToken()
  return token && !tokenExpiresSoon(token) ? token : null
}
