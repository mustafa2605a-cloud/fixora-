import Link from 'next/link'
import { FixoraLogo } from '@/components/fixora-logo'
import { getBookingSettings, getCatalog } from '@/lib/catalog'
import { describeOpeningHours } from '@/lib/data'

export async function SiteFooter() {
  const [services, settings] = await Promise.all([getCatalog().catch(() => []), getBookingSettings().catch(() => null)])
  return (
    <footer className="bg-secondary text-secondary-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-4 md:px-6">
        <div className="flex flex-col gap-4">
          <FixoraLogo variant="light" />
          <p className="text-sm leading-relaxed text-secondary-foreground/70">
            Verified professionals for every corner of your home. Book in 60 seconds, backed by the Fixora Guarantee.
          </p>
        </div>
        <FooterColumn
          title="Services"
          links={services.map((s) => ({ href: `/services/${s.slug}`, label: s.name }))}
        />
        <FooterColumn
          title="Company"
          links={[
            { href: '/about', label: 'About us' },
            { href: '/how-it-works', label: 'How it works' },
            { href: '/contact', label: 'Contact' },
          ]}
        />
        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-sm font-semibold">Get in touch</h2>
          {settings?.contact_email && (
            <a href={`mailto:${settings.contact_email}`} className="text-sm text-secondary-foreground/70 hover:text-primary">
              {settings.contact_email}
            </a>
          )}
          {settings?.contact_phone && (
            <a href={`tel:${settings.contact_phone.replace(/[^+\d]/g, '')}`} className="text-sm text-secondary-foreground/70 hover:text-primary">
              {settings.contact_phone}
            </a>
          )}
          {settings && (
            <p className="text-sm text-secondary-foreground/70">
              Open {describeOpeningHours(settings.working_days, settings.business_hours_start, settings.business_hours_end)}
            </p>
          )}
          <Link href="/contact" className="text-sm text-secondary-foreground/70 hover:text-primary">
            Send us a message
          </Link>
        </div>
      </div>
      <div className="border-t border-secondary-foreground/10">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-secondary-foreground/60 md:px-6">
          {'© 2026 Fixora. All rights reserved.'}
        </p>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-heading text-sm font-semibold">{title}</h2>
      <ul className="flex flex-col gap-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-secondary-foreground/70 hover:text-primary">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
