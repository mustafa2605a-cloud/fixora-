'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarCheck, CreditCard, HardHat, LayoutDashboard, ListChecks, Settings, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/bookings', label: 'Bookings', icon: CalendarCheck },
  { href: '/admin/technicians', label: 'Technicians', icon: HardHat },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/services', label: 'Services', icon: ListChecks },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map((item) => {
        const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              active && 'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground',
            )}
          >
            <item.icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
