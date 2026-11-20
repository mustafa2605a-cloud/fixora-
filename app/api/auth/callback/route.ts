import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createAuthActions } from '@insforge/sdk/ssr'
import { safeNextPath } from '@/lib/safe-next'

// Shared OAuth (Google) callback for the admin login and customer sign-in.
// The starting page stores where to go next in the short-lived
// `fixora_auth_next` cookie; without it we keep the original admin behaviour.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('insforge_code')
  const oauthError = request.nextUrl.searchParams.get('error')
  const base = process.env.NEXT_PUBLIC_APP_URL || request.url

  const cookieStore = await cookies()
  const next = safeNextPath(cookieStore.get('fixora_auth_next')?.value, '/admin')
  const isAdminFlow = next.startsWith('/admin')
  const login = new URL(isAdminFlow ? '/admin/login' : '/account/login', base)
  if (!isAdminFlow) login.searchParams.set('next', next)

  const fail = (reason: string) => {
    login.searchParams.set('error', reason)
    const res = NextResponse.redirect(login)
    res.cookies.delete('fixora_auth_next')
    return res
  }

  if (oauthError || !code) return fail('oauth_failed')

  const codeVerifier = cookieStore.get('insforge_code_verifier')?.value
  if (!codeVerifier) return fail('missing_verifier')

  const response = NextResponse.redirect(new URL(next, base))
  const auth = createAuthActions({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL,
    anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  })
  const { data, error } = await auth.exchangeOAuthCode(code, codeVerifier)
  if (error || !data?.user) return fail('exchange_failed')
  response.cookies.delete('insforge_code_verifier')
  response.cookies.delete('fixora_auth_next')
  return response
}
