'use client'

import { createBrowserClient } from '@insforge/sdk/ssr'
import { INSFORGE_ANON_KEY, INSFORGE_URL } from './config'

let client: ReturnType<typeof createBrowserClient> | null = null

// Session-aware browser client (reads the access-token cookie, refreshes via
// /api/auth/refresh). Auth mutations happen in Server Actions only.
export function browserClient() {
  if (!client) client = createBrowserClient({ baseUrl: INSFORGE_URL, anonKey: INSFORGE_ANON_KEY })
  return client
}

export function hasSessionCookie() {
  return typeof document !== 'undefined' && /(?:^|;\s*)insforge_access_token=/.test(document.cookie)
}
