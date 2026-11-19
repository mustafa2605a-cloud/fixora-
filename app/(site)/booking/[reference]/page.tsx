import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BookingStatusView } from '@/components/site/booking-status'

export const metadata: Metadata = {
  title: 'Your booking',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function BookingPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params
  const ref = decodeURIComponent(reference).toUpperCase().slice(0, 20)
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">Your booking</h1>
      <p className="mt-2 text-muted-foreground">Track status, payment and your technician in one place.</p>
      <div className="mt-10">
        <Suspense>
          <BookingStatusView reference={ref} />
        </Suspense>
      </div>
    </section>
  )
}
