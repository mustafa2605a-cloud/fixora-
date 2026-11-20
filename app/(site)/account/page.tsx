import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarClock, ChevronRight, LogOut, Sparkles } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { AccountAddresses, type SavedAddress } from '@/components/site/account-addresses'
import { AccountProfileForm } from '@/components/site/account-profile-form'
import { getServiceAreas } from '@/lib/catalog'
import { bookingStatusLabel, bookingStatusTone, formatCurrency, formatTime, type BookingStatus } from '@/lib/data'
import { customerSignOut } from '@/lib/auth-actions'
import { getSignedInUser, serverClient } from '@/lib/insforge/server'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'My account', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

type AccountBooking = {
  reference: string
  booking_status: BookingStatus
  payment_status: string
  service_name: string
  task_name: string | null
  appointment_date: string
  appointment_start_time: string
  appointment_end_time: string
  total_amount: number
  currency: string
  city: string
  area: string
  technician: string | null
  can_pay: boolean
  can_review: boolean
}

type AccountData = {
  email: string
  email_verified: boolean
  full_name: string | null
  phone: string | null
  member_since: string
  linked_now: number
  addresses: SavedAddress[]
  bookings: AccountBooking[]
}

const ACTIVE: BookingStatus[] = ['pending_payment', 'confirmed', 'technician_assigned', 'in_progress']

export default async function AccountPage() {
  if (!(await getSignedInUser())) redirect('/account/login?next=/account')
  const client = await serverClient()
  const [{ data, error }, areas] = await Promise.all([client.database.rpc('my_account'), getServiceAreas()])
  if (error || !data) {
    if (String(error?.message ?? '').includes('not_authenticated')) redirect('/account/login?next=/account')
    throw new Error('Could not load your account. Please refresh.')
  }
  const account = data as AccountData
  const upcoming = account.bookings.filter((b) => ACTIVE.includes(b.booking_status))
  const past = account.bookings.filter((b) => !ACTIVE.includes(b.booking_status))
  const firstName = account.full_name?.split(' ')[0]

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">{firstName ? `Hi, ${firstName}` : 'My account'}</h1>
          <p className="mt-2 text-muted-foreground">Your bookings, details and saved addresses.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/book" className={cn(buttonVariants({ size: 'lg' }), 'px-4 font-semibold')}>
            Book a service
          </Link>
          <form action={customerSignOut}>
            <Button type="submit" variant="outline" size="lg" className="gap-2 px-4">
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </div>
      </div>

      {account.linked_now > 0 && (
        <p className="mt-6 flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground" role="status">
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          We found {account.linked_now} earlier {account.linked_now === 1 ? 'booking' : 'bookings'} made with {account.email} and added{' '}
          {account.linked_now === 1 ? 'it' : 'them'} to your account.
        </p>
      )}
      {!account.email_verified && (
        <p className="mt-6 rounded-xl bg-muted px-4 py-3 text-sm" role="status">
          Verify your email to see bookings you made as a guest.
        </p>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-8">
          <BookingList title="Upcoming" bookings={upcoming} empty="No upcoming bookings." />
          <BookingList title="Past" bookings={past} empty="Completed and cancelled bookings will appear here." />
        </div>
        <aside className="flex min-w-0 flex-col gap-6">
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="font-heading text-lg font-semibold">Your details</h2>
            <p className="mt-1 text-sm text-muted-foreground">Used to fill in the booking form for you.</p>
            <div className="mt-4">
              <AccountProfileForm email={account.email} fullName={account.full_name} phone={account.phone} />
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6">
            <h2 className="font-heading text-lg font-semibold">Saved addresses</h2>
            <div className="mt-4">
              <AccountAddresses addresses={account.addresses} areas={areas} />
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}

function BookingList({ title, bookings, empty }: { title: string; bookings: AccountBooking[]; empty: string }) {
  return (
    <section>
      <h2 className="font-heading text-lg font-semibold">
        {title} <span className="text-sm font-normal text-muted-foreground">({bookings.length})</span>
      </h2>
      {bookings.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {bookings.map((b) => {
            const when = new Date(`${b.appointment_date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
            return (
              <li key={b.reference}>
                <Link
                  href={`/booking/${encodeURIComponent(b.reference)}`}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <CalendarClock className="hidden size-5 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{b.task_name ? `${b.service_name} — ${b.task_name}` : b.service_name}</span>
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', bookingStatusTone[b.booking_status])}>
                        {bookingStatusLabel[b.booking_status]}
                      </span>
                      {b.can_pay && <span className="text-xs font-medium text-primary">Payment needed</span>}
                      {b.can_review && <span className="text-xs font-medium text-primary">Leave a review</span>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {when} · {formatTime(b.appointment_start_time)}–{formatTime(b.appointment_end_time)} · {b.area}, {b.city}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {b.reference}
                      {b.technician ? ` · ${b.technician}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 font-heading font-semibold">{formatCurrency(b.total_amount, b.currency)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
