'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAuthActions } from '@insforge/sdk/ssr'
import { APP_URL, INSFORGE_ANON_KEY, INSFORGE_URL } from '@/lib/insforge/config'
import { publicClient } from '@/lib/insforge/public'
import { safeNextPath } from '@/lib/safe-next'

// Customer sign-in for the public site (optional — guests can still book).
// Sessions live in InsForge cookies; nothing here decides admin rights.

async function auth() {
  return createAuthActions({ baseUrl: INSFORGE_URL, anonKey: INSFORGE_ANON_KEY, cookies: await cookies() })
}

export type AuthStep = 'form' | 'verify' | 'forgot' | 'reset'
export type AuthState = { step?: AuthStep; error?: string; info?: string; email?: string }

const MIN_PASSWORD = 8
const field = (f: FormData, k: string) => String(f.get(k) ?? '').trim()
const emailOf = (f: FormData) => field(f, 'email').toLowerCase()
const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254

export async function customerSignIn(_: AuthState, f: FormData): Promise<AuthState> {
  const email = emailOf(f)
  const password = String(f.get('password') ?? '')
  const next = safeNextPath(field(f, 'next'), '/account')
  if (!validEmail(email) || !password) return { error: 'Enter your email and password.', email }
  const { data, error } = await (await auth()).signInWithPassword({ email, password })
  if (error || !data?.user) {
    if (error?.statusCode === 403) {
      await publicClient().auth.resendVerificationEmail({ email }).catch(() => null)
      return { step: 'verify', email, info: 'Please verify your email first. We sent a 6-digit code to your inbox.' }
    }
    return { error: 'Incorrect email or password.', email }
  }
  redirect(next)
}

export async function customerSignUp(_: AuthState, f: FormData): Promise<AuthState> {
  const name = field(f, 'name')
  const email = emailOf(f)
  const password = String(f.get('password') ?? '')
  const next = safeNextPath(field(f, 'next'), '/account')
  if (name.length < 2 || name.length > 120) return { error: 'Please enter your full name.', email }
  if (!validEmail(email)) return { error: 'Please enter a valid email address.', email }
  if (password.length < MIN_PASSWORD) return { error: `Use a password of at least ${MIN_PASSWORD} characters.`, email }
  const { data, error } = await (await auth()).signUp({ email, password, name })
  if (error) {
    const msg = String(error.message ?? '')
    if (/exist|already|registered/i.test(msg)) return { error: 'An account with this email already exists. Please sign in instead.', email }
    return { error: msg || 'Could not create your account. Please try again.', email }
  }
  if (data?.requireEmailVerification) {
    return { step: 'verify', email, info: 'We emailed you a 6-digit code. Enter it below to finish creating your account.' }
  }
  redirect(next)
}

export async function customerVerify(_: AuthState, f: FormData): Promise<AuthState> {
  const email = emailOf(f)
  const otp = field(f, 'otp')
  const next = safeNextPath(field(f, 'next'), '/account')
  if (!email || !/^\d{6}$/.test(otp)) return { step: 'verify', email, error: 'Enter the 6-digit code from your email.' }
  const { data, error } = await (await auth()).verifyEmail({ email, otp })
  if (error || !data) return { step: 'verify', email, error: 'That code is invalid or has expired.' }
  redirect(next)
}

export async function customerResendCode(_: AuthState, f: FormData): Promise<AuthState> {
  const email = emailOf(f)
  if (!validEmail(email)) return { step: 'verify', email, error: 'Missing email address.' }
  await publicClient().auth.resendVerificationEmail({ email }).catch(() => null)
  return { step: 'verify', email, info: 'A new code is on its way. It can take a minute to arrive.' }
}

// Password reset (code based): 1) email a code, 2) code + new password.
export async function customerForgot(_: AuthState, f: FormData): Promise<AuthState> {
  const email = emailOf(f)
  if (!validEmail(email)) return { step: 'forgot', email, error: 'Please enter a valid email address.' }
  await publicClient().auth.sendResetPasswordEmail({ email }).catch(() => null)
  // Same answer whether or not the account exists (no account enumeration).
  return { step: 'reset', email, info: 'If an account exists for this email, we sent a 6-digit reset code.' }
}

export async function customerReset(_: AuthState, f: FormData): Promise<AuthState> {
  const email = emailOf(f)
  const code = field(f, 'code')
  const password = String(f.get('password') ?? '')
  if (!/^\d{6}$/.test(code)) return { step: 'reset', email, error: 'Enter the 6-digit code from your email.' }
  if (password.length < MIN_PASSWORD) return { step: 'reset', email, error: `Use a password of at least ${MIN_PASSWORD} characters.` }
  const client = publicClient()
  const { data: exchanged, error: exchangeError } = await client.auth.exchangeResetPasswordToken({ email, code })
  const otp = (exchanged as { token?: string } | null)?.token
  if (exchangeError || !otp) return { step: 'reset', email, error: 'That code is invalid or has expired.' }
  const { error } = await client.auth.resetPassword({ otp, newPassword: password })
  if (error) return { step: 'reset', email, error: error.message || 'Could not reset your password.' }
  return { step: 'form', email, info: 'Password updated. Please sign in with your new password.' }
}

export async function customerGoogle(f: FormData) {
  const next = safeNextPath(field(f, 'next'), '/account')
  const cookieStore = await cookies()
  const base = APP_URL || 'http://localhost:3000'
  const { data, error } = await (await auth()).signInWithOAuth('google', {
    redirectTo: `${base}/api/auth/callback`,
    skipBrowserRedirect: true,
  })
  if (error || !data?.url || !data.codeVerifier) redirect(`/account/login?error=oauth_failed&next=${encodeURIComponent(next)}`)
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 600 }
  cookieStore.set('insforge_code_verifier', data.codeVerifier, opts)
  cookieStore.set('fixora_auth_next', next, opts)
  redirect(data.url)
}

export async function customerSignOut() {
  await (await auth()).signOut()
  redirect('/')
}
