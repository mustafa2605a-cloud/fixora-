import { createClient } from '@insforge/sdk'
import { INSFORGE_ANON_KEY, INSFORGE_URL } from './config'

// Anonymous client for public, RLS-protected data (catalogue, availability,
// guest booking lookup). Safe in both server and browser code.
let client: ReturnType<typeof createClient> | null = null

export function publicClient() {
  if (!client) {
    client = createClient({ baseUrl: INSFORGE_URL, anonKey: INSFORGE_ANON_KEY, isServerMode: typeof window === 'undefined' })
  }
  return client
}
