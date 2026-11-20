'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { browserClient, hasSessionCookie } from '@/lib/insforge/browser'

export type Account = { email: string; name: string | null; isAdmin: boolean }

// UI hint only (which links to show). Every protected page and RPC re-checks
// the session on the server / in Postgres.
export function useAccount() {
  const pathname = usePathname()
  const [account, setAccount] = useState<Account | null>(null)
  const [ready, setReady] = useState(false)
  // Re-check on every navigation: sign-in/out redirect without a full reload.
  useEffect(() => {
    if (!hasSessionCookie()) {
      setAccount(null)
      setReady(true)
      return
    }
    let cancelled = false
    Promise.resolve(browserClient().database.rpc('whoami'))
      .then(({ data }) => {
        if (cancelled) return
        const d = data as { email: string; name: string | null; is_admin: boolean } | null
        setAccount(d?.email ? { email: d.email, name: d.name, isAdmin: d.is_admin === true } : null)
        setReady(true)
      })
      .catch(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [pathname])
  return { account, ready }
}
