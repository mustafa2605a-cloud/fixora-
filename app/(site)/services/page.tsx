import type { Metadata } from 'next'
import { ServiceCard } from '@/components/site/service-card'
import { CtaBanner, SectionHeading } from '@/components/site/home-sections'
import { services } from '@/lib/data'

export const metadata: Metadata = {
  title: 'Services',
  description: 'Plumbing, electrical, AC repair, cleaning, carpentry and painting from verified Fixora professionals.',
}

export default function ServicesPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <SectionHeading
          eyebrow="Our services"
          title="Pick a service, we handle the rest"
          description="Every category comes with upfront starting prices, vetted pros and the 30-day Fixora Guarantee."
        />
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <ServiceCard key={s.slug} service={s} />
          ))}
        </div>
      </section>
      <CtaBanner />
    </>
  )
}
