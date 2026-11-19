import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { FixoraLogo } from '@/components/fixora-logo'
import { LoginForm } from '@/components/admin/login-form'
import { getAdminSession } from '@/lib/insforge/server'

export const metadata: Metadata = { title: 'Sign in' }
export const dynamic = 'force-dynamic'

const errors: Record<string, string> = {
  not_admin: 'This account does not have admin access.',
  oauth_failed: 'Google sign-in failed. Please try again.',
  missing_verifier: 'Your sign-in session expired. Please try again.',
  exchange_failed: 'Google sign-in could not be completed. Please try again.',
}

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getAdminSession()) redirect('/admin')
  const { error } = await searchParams
  return (
    <div className="flex min-h-dvh items-center justify-center bg-sidebar p-4">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-3xl border border-border bg-card p-8">
        <FixoraLogo />
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Admin sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">Restricted to the Fixora administrator.</p>
        </div>
        <LoginForm initialError={error ? (errors[error] ?? 'Sign-in failed.') : undefined} />
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to website
        </Link>
      </div>
    </div>
  )
}
