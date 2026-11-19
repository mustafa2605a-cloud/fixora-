import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Star } from 'lucide-react'
import { ServiceIcon } from '@/components/service-icon'
import { formatCurrency, type ServiceCategory } from '@/lib/data'

export function ServiceCard({ service }: { service: ServiceCategory }) {
  return (
    <Link
      href={`/services/${service.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <Image
          src={service.image || '/placeholder.svg'}
          alt=""
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <span className="absolute left-3 top-3 inline-flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ServiceIcon name={service.icon} className="size-5" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-heading text-lg font-semibold">{service.name}</h3>
          <span className="inline-flex items-center gap-1 text-sm font-medium">
            <Star className="size-4 fill-primary text-primary" aria-hidden="true" />
            {service.rating ?? 'New'}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{service.short}</p>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-sm">
            From <span className="font-semibold">{formatCurrency(service.startingPrice)}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent-foreground">
            View
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  )
}
