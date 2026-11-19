export const INSFORGE_URL = process.env.NEXT_PUBLIC_INSFORGE_URL ?? ''
export const INSFORGE_ANON_KEY = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY ?? ''
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')

export function functionUrl(slug: string) {
  return `${INSFORGE_URL}/functions/${slug}`
}
