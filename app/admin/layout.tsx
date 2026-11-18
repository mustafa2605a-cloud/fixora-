import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { FixoraLogo } from '@/components/fixora-logo'
import { AdminNav } from '@/components/admin/admin-nav'

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin | Fixora' },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:p-5">
        <FixoraLogo variant="light" href="/admin" />
        <AdminNav />
        <Link
          href="/"
          className="mt-auto hidden items-center gap-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-primary md:flex"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to website
        </Link>
      </aside>
      <main className="flex-1 overflow-x-hidden p-4 md:p-8">{children}</main>
    </div>
  )
}
