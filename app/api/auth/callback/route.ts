import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createAuthActions } from '@insforge/sdk/ssr'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('insforge_code')
  const oauthError = request.nextUrl.searchParams.get('error')
  const base = process.env.NEXT_PUBLIC_APP_URL || request.url
  const login = new URL('/admin/login', base)

  if (oauthError || !code) {
    login.searchParams.set('error', 'oauth_failed')
    return NextResponse.redirect(login)
  }

  const cookieStore = await cookies()
  const codeVerifier = cookieStore.get('insforge_code_verifier')?.value
  if (!codeVerifier) {
    login.searchParams.set('error', 'missing_verifier')
    return NextResponse.redirect(login)
  }

  const response = NextResponse.redirect(new URL('/admin', base))
  const auth = createAuthActions({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL,
    anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  })
  const { data, error } = await auth.exchangeOAuthCode(code, codeVerifier)
  if (error || !data?.user) {
    login.searchParams.set('error', 'exchange_failed')
    return NextResponse.redirect(login)
  }
  response.cookies.delete('insforge_code_verifier')
  return response
}
