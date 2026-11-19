'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAuthActions } from '@insforge/sdk/ssr'
import { APP_URL, INSFORGE_ANON_KEY, INSFORGE_URL } from '@/lib/insforge/config'

async function auth() {
  return createAuthActions({ baseUrl: INSFORGE_URL, anonKey: INSFORGE_ANON_KEY, cookies: await cookies() })
}

export type LoginState = { error?: string; needsVerification?: boolean; email?: string; info?: string }

export async function signInAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) return { error: 'Enter your email and password.' }
  const { data, error } = await (await auth()).signInWithPassword({ email, password })
  if (error || !data?.user) {
    if (error?.statusCode === 403) return { needsVerification: true, email, info: 'Verify your email to continue. Check your inbox for a 6-digit code.' }
    return { error: 'Invalid email or password.' }
  }
  redirect('/admin')
}

export async function signUpAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (!email || password.length < 8) return { error: 'Use a valid email and a password of at least 8 characters.' }
  const { data, error } = await (await auth()).signUp({ email, password })
  if (error) return { error: error.message ?? 'Could not create the account.' }
  if (data?.requireEmailVerification) return { needsVerification: true, email, info: 'We emailed you a 6-digit verification code.' }
  redirect('/admin')
}

export async function verifyAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const otp = String(formData.get('otp') ?? '').trim()
  if (!email || !otp) return { needsVerification: true, email, error: 'Enter the code from your email.' }
  const { data, error } = await (await auth()).verifyEmail({ email, otp })
  if (error || !data) return { needsVerification: true, email, error: 'That code is invalid or expired.' }
  redirect('/admin')
}

export async function googleSignInAction() {
  const cookieStore = await cookies()
  const base = APP_URL || 'http://localhost:3000'
  const { data, error } = await (await auth()).signInWithOAuth('google', {
    redirectTo: `${base}/api/auth/callback`,
    skipBrowserRedirect: true,
  })
  if (error || !data?.url || !data.codeVerifier) redirect('/admin/login?error=oauth_failed')
  cookieStore.set('insforge_code_verifier', data.codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  redirect(data.url)
}

export async function signOutAction() {
  await (await auth()).signOut()
  redirect('/admin/login')
}
