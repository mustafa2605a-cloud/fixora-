import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, LogOut } from 'lucide-react'
import { FixoraLogo } from '@/components/fixora-logo'
import { AdminNav } from '@/components/admin/admin-nav'
import { getAdminSession, getSignedInUser } from '@/lib/insforge/server'
import { signOutAction } from '@/app/admin/login/actions'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession()
  if (!admin) {
    const user = await getSignedInUser()
    redirect(user ? '/admin/login?error=not_admin' : '/admin/login')
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex flex-col gap-6 bg-sidebar p-4 text-sidebar-foreground md:sticky md:top-0 md:h-dvh md:w-60 md:shrink-0 md:p-5">
        <FixoraLogo variant="light" href="/admin" />
        <AdminNav />
        <form action={signOutAction} className="md:hidden">
          <button type="submit" className="flex items-center gap-2 text-xs text-sidebar-foreground/70">
            <LogOut className="size-3.5" aria-hidden="true" /> Sign out
          </button>
        </form>
        <div className="mt-auto hidden flex-col gap-3 md:flex">
          <p className="truncate text-xs text-sidebar-foreground/60" title={admin.email}>
            {admin.email}
          </p>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex items-center gap-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-primary"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
          <Link href="/" className="flex items-center gap-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-primary">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to website
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden p-4 md:p-8">{children}</main>
    </div>
  )
}
