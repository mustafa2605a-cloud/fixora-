'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { FixoraLogo } from '@/components/fixora-logo'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const nav = [
  { href: '/services', label: 'Services' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-6">
        <FixoraLogo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                  active && 'text-foreground',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/admin" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
            Admin
          </Link>
          <Link href="/book" className={cn(buttonVariants({ size: 'lg' }), 'px-4 font-semibold')}>
            Book a service
          </Link>
        </div>
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-md md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-border px-4 py-3 md:hidden">
          <ul className="flex flex-col gap-1">
            {[...nav, { href: '/admin', label: 'Admin dashboard' }].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="pt-2">
              <Link
                href="/book"
                onClick={() => setOpen(false)}
                className={cn(buttonVariants({ size: 'lg' }), 'w-full font-semibold')}
              >
                Book a service
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  )
}
