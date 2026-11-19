import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@insforge/sdk/ssr'
import { INSFORGE_ANON_KEY, INSFORGE_URL } from './config'

export async function serverClient() {
  return createServerClient({ baseUrl: INSFORGE_URL, anonKey: INSFORGE_ANON_KEY, cookies: await cookies() })
}

export type AdminSession = { userId: string; email: string; name: string | null }

// Admin status is decided by Postgres (public.is_admin(): verified email that
// matches the configured admin email). Never by the frontend.
export async function getAdminSession(): Promise<AdminSession | null> {
  const client = await serverClient()
  const { data: userData } = await client.auth.getCurrentUser()
  const user = userData?.user
  if (!user) return null
  const { data: isAdmin, error } = await client.database.rpc('is_admin')
  if (error || isAdmin !== true) return null
  return {
    userId: user.id,
    email: user.email,
    name: (user.profile as { name?: string } | null)?.name ?? null,
  }
}

export async function getSignedInUser() {
  const client = await serverClient()
  const { data } = await client.auth.getCurrentUser()
  return data?.user ?? null
}
