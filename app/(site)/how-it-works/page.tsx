import type { Metadata } from 'next'
import { CtaBanner, Faq, HowItWorks } from '@/components/site/home-sections'

export const metadata: Metadata = {
  title: 'How it works',
  description: 'Choose a service, pick a time, get it fixed, relax. See how Fixora works.',
}

export default function HowItWorksPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h1 className="font-heading text-4xl font-bold tracking-tight text-balance md:text-5xl">
          Home repairs, without the runaround
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
          No phone tag, no surprise invoices. Fixora matches you with the right verified professional and keeps you
          updated from booking to completion.
        </p>
      </section>
      <HowItWorks />
      <Faq />
      <CtaBanner />
    </>
  )
}
