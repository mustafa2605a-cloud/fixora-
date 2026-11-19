import type { Metadata } from 'next'
import { BookingForm } from '@/components/site/booking-form'
import { getBookingSettings, getCatalog, getServiceAreas } from '@/lib/catalog'

export const metadata: Metadata = {
  title: 'Book a service',
  description: 'Book a verified Fixora professional in under 60 seconds.',
}

export default async function BookPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const { service } = await searchParams
  const [services, areas, settings] = await Promise.all([getCatalog(), getServiceAreas(), getBookingSettings()])
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">Book a service</h1>
      <p className="mt-2 text-muted-foreground">Three quick steps, then secure online payment. No account needed.</p>
      <div className="mt-10">
        <BookingForm key={service} services={services} areas={areas} settings={settings} initialService={service} />
      </div>
    </section>
  )
}
