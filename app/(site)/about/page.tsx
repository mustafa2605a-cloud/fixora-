import type { Metadata } from 'next'
import Image from 'next/image'
import { BadgeCheck, HeartHandshake, ShieldCheck, Timer } from 'lucide-react'
import { CtaBanner } from '@/components/site/home-sections'

export const metadata: Metadata = {
  title: 'About',
  description: 'Fixora makes home maintenance simple with verified professionals and transparent pricing.',
}

const values = [
  { icon: BadgeCheck, title: 'Verified pros', text: 'Background checks, skills tests and insurance for every technician.' },
  { icon: Timer, title: 'On time', text: 'Two-hour arrival windows with live updates on the day.' },
  { icon: ShieldCheck, title: 'Guaranteed', text: 'Every job covered for 30 days. If it is not right, we fix it free.' },
  { icon: HeartHandshake, title: 'Fair pay', text: 'Technicians keep the majority of every job they complete.' },
]

export default function AboutPage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:px-6">
        <div className="flex flex-col gap-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent-foreground">About Fixora</p>
          <h1 className="font-heading text-4xl font-bold tracking-tight text-balance md:text-5xl">
            We built the repair service we always wanted
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground text-pretty">
            Fixora started with a leaking pipe and three no-show plumbers. Today we connect thousands of households with
            skilled local professionals every week — with honest prices and work we stand behind.
          </p>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-muted">
          <Image src="/images/services/carpentry.png" alt="A Fixora carpenter at work" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        </div>
      </section>
      <section className="border-y border-border bg-card">
        <ul className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:grid-cols-2 md:px-6 lg:grid-cols-4">
          {values.map((v) => (
            <li key={v.title} className="flex flex-col gap-3">
              <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <v.icon className="size-5" aria-hidden="true" />
              </span>
              <h2 className="font-heading text-lg font-semibold">{v.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{v.text}</p>
            </li>
          ))}
        </ul>
      </section>
      <CtaBanner />
    </>
  )
}
