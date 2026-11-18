import Link from 'next/link'
import { FixoraLogo } from '@/components/fixora-logo'
import { services } from '@/lib/data'

export function SiteFooter() {
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
            { href: '/admin', label: 'Admin dashboard' },
          ]}
        />
        <div className="flex flex-col gap-3">
          <h2 className="font-heading text-sm font-semibold">Get in touch</h2>
          <p className="text-sm text-secondary-foreground/70">support@fixora.app</p>
          <p className="text-sm text-secondary-foreground/70">+1 (555) 010-0100</p>
          <p className="text-sm text-secondary-foreground/70">Open 7 days, 7am – 10pm</p>
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
