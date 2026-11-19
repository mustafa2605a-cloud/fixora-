'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  googleSignInAction,
  signInAction,
  signUpAction,
  verifyAction,
  type LoginState,
} from '@/app/admin/login/actions'

const fieldClass =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function LoginForm({ initialError }: { initialError?: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [signInState, signIn, signingIn] = useActionState<LoginState, FormData>(signInAction, { error: initialError })
  const [signUpState, signUp, signingUp] = useActionState<LoginState, FormData>(signUpAction, {})
  const [verifyState, verify, verifying] = useActionState<LoginState, FormData>(verifyAction, {})
  const state = verifyState.needsVerification || verifyState.error ? verifyState : mode === 'signin' ? signInState : signUpState
  const needsVerification = state.needsVerification || signInState.needsVerification || signUpState.needsVerification
  const email = state.email ?? signInState.email ?? signUpState.email

  if (needsVerification) {
    return (
      <form action={verify} className="flex flex-col gap-4">
        <input type="hidden" name="email" value={email ?? ''} />
        <p className="text-sm text-muted-foreground">{state.info ?? signInState.info ?? signUpState.info}</p>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Verification code
          <input name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className={fieldClass} />
        </label>
        {verifyState.error && <p className="text-sm text-destructive" role="alert">{verifyState.error}</p>}
        <Button type="submit" size="lg" className="h-11 font-semibold" disabled={verifying}>
          {verifying && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Verify and continue
        </Button>
      </form>
    )
  }

  const pending = signingIn || signingUp
  return (
    <div className="flex flex-col gap-4">
      <form action={googleSignInAction}>
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
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <form action={mode === 'signin' ? signIn : signUp} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Email
          <input name="email" type="email" autoComplete="email" required className={fieldClass} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            className={fieldClass}
          />
        </label>
        {state.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
        <Button type="submit" size="lg" className="h-11 font-semibold" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
      <button
        type="button"
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        className="text-left text-xs text-muted-foreground hover:text-foreground"
      >
        {mode === 'signin' ? 'First time? Set up the admin account with your email.' : 'Already have an account? Sign in.'}
      </button>
    </div>
  )
}
