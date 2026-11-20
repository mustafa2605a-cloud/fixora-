'use client'

import { useActionState, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  customerForgot,
  customerGoogle,
  customerResendCode,
  customerReset,
  customerSignIn,
  customerSignUp,
  customerVerify,
  type AuthState,
} from '@/lib/auth-actions'
import { cn } from '@/lib/utils'

const fieldClass =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

type View = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset'

export function AccountAuthForm({ next, initialError, initialMode = 'signin' }: { next: string; initialError?: string; initialMode?: 'signin' | 'signup' }) {
  const [view, setView] = useState<View>(initialMode)
  const [email, setEmail] = useState('')
  const [signInState, signIn, signingIn] = useActionState<AuthState, FormData>(customerSignIn, { error: initialError })
  const [signUpState, signUp, signingUp] = useActionState<AuthState, FormData>(customerSignUp, {})
  const [verifyState, verify, verifying] = useActionState<AuthState, FormData>(customerVerify, {})
  const [resendState, resend, resending] = useActionState<AuthState, FormData>(customerResendCode, {})
  const [forgotState, forgot, sendingReset] = useActionState<AuthState, FormData>(customerForgot, {})
  const [resetState, reset, resetting] = useActionState<AuthState, FormData>(customerReset, {})

  // Server actions decide the next step (e.g. "verify your email").
  useEffect(() => {
    for (const s of [signInState, signUpState, forgotState, resetState]) {
      if (s.email) setEmail(s.email)
    }
  }, [signInState, signUpState, forgotState, resetState])
  useEffect(() => {
    if (signInState.step === 'verify' || signUpState.step === 'verify') setView('verify')
  }, [signInState, signUpState])
  useEffect(() => {
    if (forgotState.step === 'reset') setView('reset')
  }, [forgotState])
  useEffect(() => {
    if (resetState.step === 'form') setView('signin')
  }, [resetState])

  const hidden = (
    <>
      <input type="hidden" name="next" value={next} />
    </>
  )

  if (view === 'verify') {
    const s = verifyState.error || verifyState.info ? verifyState : resendState.info || resendState.error ? resendState : signUpState.step === 'verify' ? signUpState : signInState
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold">Check your email</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {s.info ?? 'Enter the 6-digit code we sent to'} <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>
        <form action={verify} className="flex flex-col gap-4">
          {hidden}
          <input type="hidden" name="email" value={email} />
          <label className="flex flex-col gap-2 text-sm font-medium">
            Verification code
            <input name="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className={cn(fieldClass, 'tracking-[0.4em]')} />
          </label>
          {(verifyState.error || resendState.error) && (
            <p className="text-sm text-destructive" role="alert">
              {verifyState.error ?? resendState.error}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11 font-semibold" disabled={verifying}>
            {verifying && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Verify and continue
          </Button>
        </form>
        <form action={resend} className="flex items-center justify-between text-sm">
          <input type="hidden" name="email" value={email} />
          <button type="submit" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" disabled={resending}>
            {resending ? 'Sending…' : 'Send a new code'}
          </button>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setView('signin')}>
            Back to sign in
          </button>
        </form>
      </div>
    )
  }

  if (view === 'forgot' || view === 'reset') {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="font-heading text-xl font-semibold">Reset your password</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === 'forgot' ? 'We will email you a 6-digit code.' : (forgotState.info ?? 'Enter the code from your email and a new password.')}
          </p>
        </div>
        {view === 'forgot' ? (
          <form action={forgot} className="flex flex-col gap-4">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Email
              <input name="email" type="email" autoComplete="email" required defaultValue={email} className={fieldClass} />
            </label>
            {forgotState.error && <p className="text-sm text-destructive" role="alert">{forgotState.error}</p>}
            <Button type="submit" size="lg" className="h-11 font-semibold" disabled={sendingReset}>
              {sendingReset && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Send reset code
            </Button>
          </form>
        ) : (
          <form action={reset} className="flex flex-col gap-4">
            <input type="hidden" name="email" value={email} />
            <label className="flex flex-col gap-2 text-sm font-medium">
              Reset code
              <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className={cn(fieldClass, 'tracking-[0.4em]')} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              New password
              <input name="password" type="password" autoComplete="new-password" minLength={8} required className={fieldClass} />
            </label>
            {resetState.error && <p className="text-sm text-destructive" role="alert">{resetState.error}</p>}
            <Button type="submit" size="lg" className="h-11 font-semibold" disabled={resetting}>
              {resetting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Save new password
            </Button>
          </form>
        )}
        <button type="button" className="text-left text-sm text-muted-foreground hover:text-foreground" onClick={() => setView('signin')}>
          Back to sign in
        </button>
      </div>
    )
  }

  const isSignUp = view === 'signup'
  const state = isSignUp ? signUpState : signInState
  const pending = signingIn || signingUp
  const notice = !isSignUp && resetState.step === 'form' ? resetState.info : undefined

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 rounded-xl bg-muted p-1 text-sm font-medium" role="tablist">
        {(['signin', 'signup'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn('rounded-lg py-2 transition-colors', view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            {v === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <form action={customerGoogle}>
        {hidden}
        <Button type="submit" variant="outline" size="lg" className="h-11 w-full font-semibold">
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.1-4 1.1-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
            <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
          </svg>
          Continue with Google
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form key={view} action={isSignUp ? signUp : signIn} className="flex flex-col gap-4">
        {hidden}
        {isSignUp && (
          <label className="flex flex-col gap-2 text-sm font-medium">
            Full name
            <input name="name" autoComplete="name" required maxLength={120} className={fieldClass} />
          </label>
        )}
        <label className="flex flex-col gap-2 text-sm font-medium">
          Email
          <input name="email" type="email" autoComplete="email" required defaultValue={email} maxLength={254} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          <span className="flex items-center justify-between">
            Password
            {!isSignUp && (
              <button type="button" className="text-xs font-normal text-muted-foreground hover:text-foreground" onClick={() => setView('forgot')}>
                Forgot password?
              </button>
            )}
          </span>
          <input
            name="password"
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            required
            minLength={isSignUp ? 8 : undefined}
            className={fieldClass}
          />
          {isSignUp && <span className="text-xs font-normal text-muted-foreground">At least 8 characters.</span>}
        </label>
        {notice && <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">{notice}</p>}
        {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
        <Button type="submit" size="lg" className="h-11 font-semibold" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {isSignUp ? 'Create account' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
