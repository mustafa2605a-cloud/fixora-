import Image from 'next/image'
import Link from 'next/link'
import { BadgeCheck, CalendarCheck, Clock, ShieldCheck, Star, Wrench } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { ServiceCard } from '@/components/site/service-card'
import { ServiceIcon } from '@/components/service-icon'
import { faqs, testimonials } from '@/lib/data'
import { getCatalog } from '@/lib/catalog'
import { cn } from '@/lib/utils'

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:px-6 md:py-20">
        <div className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            <BadgeCheck className="size-4" aria-hidden="true" />
            Trusted by 40,000+ households
          </span>
          <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight text-balance md:text-5xl lg:text-6xl">
            Book. Fix. <span className="text-primary">Relax.</span>
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-muted-foreground text-pretty">
            Verified plumbers, electricians, cleaners and more — at your door today, with upfront prices and a 30-day
            guarantee.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/book" className={cn(buttonVariants({ size: 'lg' }), 'h-12 px-6 text-base font-semibold')}>
              Book a service
            </Link>
            <Link
              href="/services"
              className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-12 px-6 text-base')}
            >
              Explore services
            </Link>
          </div>
          <dl className="flex flex-wrap gap-8 pt-2">
            {[
              ['4.9/5', 'Average rating'],
              ['60 sec', 'To book'],
              ['2,000+', 'Verified pros'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd className="font-heading text-2xl font-bold">{value}</dd>
                <dd className="text-sm text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative">
          <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-muted md:aspect-square">
            <Image
              src="/images/hero-technician.png"
              alt="A Fixora technician with a toolbox in a bright living room"
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          <div className="absolute -bottom-4 left-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg md:-left-6">
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <CalendarCheck className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold">Technician on the way</p>
              <p className="text-xs text-muted-foreground">Arriving in 25 min</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export async function CategoryStrip() {
  const services = await getCatalog()
  return (
    <section aria-label="Service categories" className="border-y border-border bg-card">
      <ul className="mx-auto grid max-w-6xl grid-cols-3 gap-2 px-4 py-6 md:grid-cols-6 md:px-6">
        {services.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/book?service=${s.slug}`}
              className="flex flex-col items-center gap-2 rounded-xl p-3 text-center text-sm font-medium transition-colors hover:bg-muted"
            >
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <ServiceIcon name={s.icon} className="size-5" />
              </span>
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p className="text-sm font-semibold uppercase tracking-wider text-accent-foreground">{eyebrow}</p>
      <h2 className="font-heading text-3xl font-bold tracking-tight text-balance md:text-4xl">{title}</h2>
      {description && <p className="leading-relaxed text-muted-foreground text-pretty">{description}</p>}
    </div>
  )
}

export async function PopularServices() {
  const services = await getCatalog()
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <SectionHeading
          eyebrow="Popular services"
          title="Everything your home needs, in one app"
          description="Fixed starting prices, vetted professionals and same-day availability across every category."
        />
        <Link href="/services" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'w-fit px-4')}>
          All services
        </Link>
      </div>
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <ServiceCard key={s.slug} service={s} />
        ))}
      </div>
    </section>
  )
}

export const steps = [
  { icon: Wrench, title: 'Choose a service', text: 'Pick from six categories and the exact task you need done.' },
  { icon: Clock, title: 'Pick a time', text: 'Select a date and a two-hour arrival window that suits you.' },
  { icon: BadgeCheck, title: 'Get it fixed', text: 'A verified pro arrives on time and completes the job.' },
  { icon: ShieldCheck, title: 'Relax', text: 'Pay securely online. Every visit is covered for 30 days.' },
]

export function HowItWorks() {
  return (
    <section className="bg-secondary text-secondary-foreground">
      <div className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">How it works</p>
          <h2 className="font-heading text-3xl font-bold tracking-tight text-balance md:text-4xl">
            Four steps from broken to sorted
          </h2>
        </div>
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-4 rounded-2xl border border-secondary-foreground/10 p-6">
              <div className="flex items-center justify-between">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <step.icon className="size-5" aria-hidden="true" />
                </span>
                <span className="font-heading text-3xl font-bold text-secondary-foreground/20">0{i + 1}</span>
              </div>
              <h3 className="font-heading text-lg font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-secondary-foreground/70">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function Testimonials() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
      <SectionHeading eyebrow="Reviews" title="Loved by homeowners and landlords" />
      <ul className="mt-10 grid gap-6 md:grid-cols-3">
        {testimonials.map((t) => (
          <li key={t.name} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6">
            <div className="flex gap-0.5" aria-label={`${t.rating} out of 5 stars`}>
              {Array.from({ length: t.rating }).map((_, i) => (
                <Star key={i} className="size-4 fill-primary text-primary" aria-hidden="true" />
              ))}
            </div>
            <blockquote className="leading-relaxed text-pretty">{`“${t.quote}”`}</blockquote>
            <p className="mt-auto text-sm">
              <span className="font-semibold">{t.name}</span>{' '}
              <span className="text-muted-foreground">· {t.role}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Faq() {
  return (
    <section className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-[1fr_1.5fr] md:px-6">
        <SectionHeading eyebrow="FAQ" title="Questions, answered" />
        <div className="flex flex-col divide-y divide-border">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {f.q}
                <span className="text-xl text-muted-foreground transition-transform group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CtaBanner() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
      <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-primary p-8 text-primary-foreground md:flex-row md:items-center md:p-12">
        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-2xl font-bold tracking-tight text-balance md:text-3xl">
            Something broken? Let&apos;s fix it today.
          </h2>
          <p className="text-primary-foreground/80">Same-day slots available in your area.</p>
        </div>
        <Link
          href="/book"
          className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'h-12 px-6 text-base font-semibold')}
        >
          Book now
        </Link>
      </div>
    </section>
  )
}
