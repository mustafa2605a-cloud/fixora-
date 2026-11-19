'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ChevronRight, Loader2, Search } from 'lucide-react'
import { Pagination, StatusBadge, TableCard, td, th } from '@/components/admin/admin-ui'
import { bookingStatusLabel, formatCurrency, formatTime, type BookingStatus } from '@/lib/data'
import { cn } from '@/lib/utils'

export type BookingRow = {
  id: string
  booking_reference: string
  guest_name: string
  guest_email: string
  guest_phone: string
  area: string
  city: string
  service_name_snapshot: string
  task_name_snapshot: string | null
  appointment_date: string
  appointment_start_time: string
  booking_status: BookingStatus
  payment_status: string
  total_amount: number
  currency: string
  technician: { full_name: string } | null
}

type Filters = { q: string; status: string; sort: string; from: string; to: string }

const statuses = ['all', ...Object.keys(bookingStatusLabel)] as const

export function BookingsTable({
  rows,
  total,
  page,
  pageSize,
  filters,
  error,
}: {
  rows: BookingRow[]
  total: number
  page: number
  pageSize: number
  filters: Filters
  error?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState(filters.q)
  const [pending, start] = useTransition()

  function href(next: Partial<Filters> & { page?: number }) {
    const merged = { ...filters, ...next }
    const params = new URLSearchParams()
    if (merged.q) params.set('q', merged.q)
    if (merged.status && merged.status !== 'all') params.set('status', merged.status)
    if (merged.sort && merged.sort !== 'newest') params.set('sort', merged.sort)
    if (merged.from) params.set('from', merged.from)
    if (merged.to) params.set('to', merged.to)
    if (next.page && next.page > 1) params.set('page', String(next.page))
    const s = params.toString()
    return s ? `${pathname}?${s}` : pathname
  }

  function go(next: Partial<Filters>) {
    start(() => router.push(href(next)))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filters.status === s}
              onClick={() => go({ status: s })}
              className={cn(
                'rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium',
                filters.status === s && 'border-secondary bg-secondary text-secondary-foreground',
              )}
            >
              {s === 'all' ? 'All' : bookingStatusLabel[s as BookingStatus]}
            </button>
          ))}
        </div>
        <form
          className="relative w-full lg:w-72"
          onSubmit={(e) => {
            e.preventDefault()
            go({ q: query.trim() })
          }}
        >
          <label>
            <span className="sr-only">Search bookings</span>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ref, customer, email, phone"
              className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
        </form>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2">
          Sort
          <select
            value={filters.sort}
            onChange={(e) => go({ sort: e.target.value })}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="appointment">Appointment (soonest)</option>
            <option value="appointment_desc">Appointment (latest)</option>
            <option value="amount">Amount (high → low)</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          From
          <input type="date" value={filters.from} onChange={(e) => go({ from: e.target.value })} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
        </label>
        <label className="flex items-center gap-2">
          To
          <input type="date" value={filters.to} onChange={(e) => go({ to: e.target.value })} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
        </label>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
      </div>
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <TableCard>
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>ID</th>
              <th className={th}>Customer</th>
              <th className={th}>Service</th>
              <th className={th}>Technician</th>
              <th className={th}>When</th>
              <th className={`${th} text-right`}>Amount</th>
              <th className={th}>Status</th>
              <th className={th}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((b) => (
              <tr key={b.id} className="hover:bg-muted/40">
                <td className={`${td} font-mono text-xs`}>
                  <Link href={`/admin/bookings/${b.id}`} className="hover:underline">
                    {b.booking_reference}
                  </Link>
                </td>
                <td className={td}>
                  <p className="font-medium">{b.guest_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.area}, {b.city}
                  </p>
                </td>
                <td className={td}>
                  <p>{b.service_name_snapshot}</p>
                  <p className="text-xs text-muted-foreground">{b.task_name_snapshot}</p>
                </td>
                <td className={td}>{b.technician?.full_name ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                <td className={td}>
                  {b.appointment_date} · {formatTime(b.appointment_start_time)}
                </td>
                <td className={`${td} text-right font-medium`}>
                  {formatCurrency(Number(b.total_amount), b.currency)}
                  <p className="text-xs font-normal">
                    <StatusBadge status={b.payment_status} />
                  </p>
                </td>
                <td className={td}>
                  <StatusBadge status={b.booking_status} />
                </td>
                <td className={td}>
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    aria-label={`Manage ${b.booking_reference}`}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium hover:bg-muted"
                  >
                    Manage <ChevronRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No bookings match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableCard>
      <Pagination page={page} pageSize={pageSize} total={total} hrefFor={(p) => href({ page: p })} />
    </div>
  )
}
