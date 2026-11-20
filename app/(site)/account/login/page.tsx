import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarCheck, MapPin, UserRound } from 'lucide-react'
import { AccountAuthForm } from '@/components/site/account-auth-form'
import { getSignedInUser } from '@/lib/insforge/server'
import { safeNextPath } from '@/lib/safe-next'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const errors: Record<string, string> = {
  oauth_failed: 'Google sign-in failed. Please try again.',
  missing_verifier: 'Your sign-in session expired. Please try again.',
  exchange_failed: 'Google sign-in could not be completed. Please try again.',
}

const perks = [
  { icon: CalendarCheck, text: 'See all your bookings in one place — including ones you made as a guest with the same email.' },
  { icon: MapPin, text: 'Your name, phone and addresses are filled in for you next time.' },
  { icon: UserRound, text: 'Optional. You can always book without an account.' },
]

export default async function AccountLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; mode?: string }> }) {
  const { next: rawNext, error, mode } = await searchParams
  const next = safeNextPath(rawNext, '/account')
  if (await getSignedInUser()) redirect(next)

  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:px-6 md:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
      <div className="min-w-0">
        <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">Your Fixora account</h1>
        <p className="mt-2 text-muted-foreground">Sign in to keep your bookings and details together.</p>
        <ul className="mt-8 flex flex-col gap-4">
          {perks.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="pt-1.5 text-sm">{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-muted-foreground">
          Just want to book?{' '}
          <Link href="/book" className="font-medium text-foreground underline-offset-4 hover:underline">
            Continue as a guest
          </Link>
        </p>
      </div>
      <div className="min-w-0 rounded-3xl border border-border bg-card p-6 md:p-8">
        <AccountAuthForm
          next={next}
          initialError={error ? (errors[error] ?? 'Sign-in failed. Please try again.') : undefined}
          initialMode={mode === 'signup' ? 'signup' : 'signin'}
        />
      </div>
    </section>
  )
}
