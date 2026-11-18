'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { StatusBadge, TableCard, td, th } from '@/components/admin/admin-ui'
import { bookings as initialBookings, formatCurrency, type Booking, type BookingStatus } from '@/lib/data'
import { cn } from '@/lib/utils'

const statuses: (BookingStatus | 'All')[] = ['All', 'Pending', 'Confirmed', 'In Progress', 'Completed', 'Cancelled']

export function BookingsTable() {
  const [rows, setRows] = useState<Booking[]>(initialBookings)
  const [filter, setFilter] = useState<(typeof statuses)[number]>('All')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(
      (b) =>
        (filter === 'All' || b.status === filter) &&
        (!q || [b.id, b.customer, b.service, b.technician].some((v) => v.toLowerCase().includes(q))),
    )
  }, [rows, filter, query])

  function updateStatus(id: string, status: BookingStatus) {
    setRows((prev) => prev.map((b) => (b.id === id ? { ...b, status } : b)))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={cn(
                'rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium',
                filter === s && 'border-secondary bg-secondary text-secondary-foreground',
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <label className="relative w-full lg:w-72">
          <span className="sr-only">Search bookings</span>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ID, customer, technician"
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
      </div>
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
                <span className="sr-only">Update status</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((b) => (
              <tr key={b.id}>
                <td className={`${td} font-mono text-xs`}>{b.id}</td>
                <td className={td}>
                  <p className="font-medium">{b.customer}</p>
                  <p className="text-xs text-muted-foreground">{b.address}</p>
                </td>
                <td className={td}>
                  <p>{b.service}</p>
                  <p className="text-xs text-muted-foreground">{b.task}</p>
                </td>
                <td className={td}>{b.technician}</td>
                <td className={td}>
                  {b.date} · {b.time}
                </td>
                <td className={`${td} text-right font-medium`}>{formatCurrency(b.amount)}</td>
                <td className={td}>
                  <StatusBadge status={b.status} />
                </td>
                <td className={td}>
                  <select
                    aria-label={`Update status for ${b.id}`}
                    value={b.status}
                    onChange={(e) => updateStatus(b.id, e.target.value as BookingStatus)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {statuses.slice(1).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No bookings match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableCard>
      <p className="text-xs text-muted-foreground">
        Showing {visible.length} of {rows.length} bookings. Status changes are demo-only and reset on reload.
      </p>
    </div>
  )
}
