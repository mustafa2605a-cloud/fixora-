import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, Clock, ShieldCheck, Star } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { ServiceIcon } from '@/components/service-icon'
import { formatCurrency } from '@/lib/data'
import { getCatalog, getServiceBySlug } from '@/lib/catalog'
import { cn } from '@/lib/utils'

export const revalidate = 60

export async function generateStaticParams() {
  const services = await getCatalog().catch(() => [])
  return services.map((s) => ({ slug: s.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const service = await getServiceBySlug(slug)
  if (!service) return {}
  return { title: service.name, description: service.description }
}

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = await getServiceBySlug(slug)
  if (!service) notFound()

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <Link href="/services" className="hover:text-foreground">
          Services
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-foreground">{service.name}</span>
      </nav>
      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6">
          <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-muted">
            <Image src={service.image || '/placeholder.svg'} alt={`${service.name} service`} fill priority sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ServiceIcon name={service.icon} className="size-6" />
            </span>
            <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">{service.name}</h1>
          </div>
          <p className="text-lg leading-relaxed text-muted-foreground text-pretty">{service.description}</p>
          <div className="flex flex-wrap gap-6 text-sm">
            <span className="inline-flex items-center gap-2">
              <Star className="size-4 fill-primary text-primary" aria-hidden="true" />
              {service.rating !== null ? (
                <>
                  <span className="font-semibold">{service.rating}</span> rating ({service.reviewCount})
                </>
              ) : (
                <span className="font-semibold">New</span>
              )}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4" aria-hidden="true" /> {service.duration}
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4" aria-hidden="true" /> 30-day guarantee
            </span>
          </div>
          <div>
            <h2 className="font-heading text-lg font-semibold">What&apos;s included</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {service.includes.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm">
                  <Check className="size-4 text-accent-foreground" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="h-fit rounded-3xl border border-border bg-card p-6 lg:sticky lg:top-24">
          <h2 className="font-heading text-xl font-semibold">Pricing</h2>
          <p className="mt-1 text-sm text-muted-foreground">Starting prices. Parts approved by you before work begins.</p>
          <ul className="mt-6 flex flex-col divide-y divide-border">
            {service.tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span>{task.name}</span>
                <span className="font-semibold">{formatCurrency(task.price)}</span>
              </li>
            ))}
          </ul>
          <Link
            href={`/book?service=${service.slug}`}
            className={cn(buttonVariants({ size: 'lg' }), 'mt-6 h-12 w-full text-base font-semibold')}
          >
            Book {service.name.toLowerCase()}
          </Link>
          {service.jobsDone > 0 && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {service.jobsDone.toLocaleString('en-US')} jobs completed on Fixora
            </p>
          )}
        </aside>
      </div>
    </section>
  )
}
