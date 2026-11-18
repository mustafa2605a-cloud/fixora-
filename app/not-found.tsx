import Link from 'next/link'
import { FixoraLogo } from '@/components/fixora-logo'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <FixoraLogo />
      <h1 className="font-heading text-3xl font-bold">This page needs a repair</h1>
      <p className="text-muted-foreground">We couldn&apos;t find what you were looking for.</p>
      <Link href="/" className={buttonVariants({ size: 'lg' })}>
        Back to home
      </Link>
    </main>
  )
}
