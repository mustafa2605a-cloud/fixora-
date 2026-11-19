'use client'

import { useEffect, useState } from 'react'
import { browserClient, hasSessionCookie } from '@/lib/insforge/browser'

// UI hint only: hides admin links from everyone else. Real protection is the
// server-side admin check on every admin page and RLS / is_admin() in Postgres.
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    if (!hasSessionCookie()) return
    let cancelled = false
    Promise.resolve(browserClient().database.rpc('is_admin'))
      .then(({ data }) => {
        if (!cancelled) setIsAdmin(data === true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return isAdmin
}
