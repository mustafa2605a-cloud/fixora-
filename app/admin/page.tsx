import Link from 'next/link'
import { CalendarCheck, DollarSign, HardHat, Star } from 'lucide-react'
import { PageHeader, StatCard, StatusBadge, TableCard, td, th } from '@/components/admin/admin-ui'
import { bookings, formatCurrency, monthlyRevenue, services, technicians } from '@/lib/data'

export const metadata = { title: 'Overview' }

export default function AdminOverviewPage() {
  const revenue = bookings.filter((b) => b.status !== 'Cancelled').reduce((sum, b) => sum + b.amount, 0)
  const active = bookings.filter((b) => b.status === 'Confirmed' || b.status === 'In Progress').length
  const available = technicians.filter((t) => t.status === 'Available').length
  const maxRevenue = Math.max(...monthlyRevenue.map((m) => m.value))
  const byService = services.map((s) => ({
    name: s.name,
    count: bookings.filter((b) => b.service === s.name).length,
  }))
  const maxCount = Math.max(...byService.map((s) => s.count))

  return (
    <>
      <PageHeader title="Overview" description="Tuesday, November 17, 2026" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue (this week)" value={formatCurrency(revenue)} delta="+12.4% vs last week" icon={DollarSign} />
        <StatCard label="Active bookings" value={String(active)} delta="+3 today" icon={CalendarCheck} />
        <StatCard label="Technicians available" value={`${available} / ${technicians.length}`} icon={HardHat} />
        <StatCard label="Avg. rating" value="4.85" delta="+0.04 this month" icon={Star} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-heading font-semibold">Monthly revenue</h2>
          <ul className="mt-6 flex h-56 items-end gap-3" aria-label="Monthly revenue chart">
            {monthlyRevenue.map((m) => (
              <li key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-xs font-medium">{`$${(m.value / 1000).toFixed(1)}k`}</span>
                <div
                  className="w-full rounded-t-lg bg-primary"
                  style={{ height: `${(m.value / maxRevenue) * 80}%` }}
                  aria-hidden="true"
                />
                <span className="text-xs text-muted-foreground">{m.month}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-heading font-semibold">Bookings by service</h2>
          <ul className="mt-6 flex flex-col gap-4">
            {byService.map((s) => (
              <li key={s.name} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span>{s.name}</span>
                  <span className="font-medium">{s.count}</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-secondary" style={{ width: `${(s.count / maxCount) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading font-semibold">Recent bookings</h2>
          <Link href="/admin/bookings" className="text-sm font-medium text-accent-foreground hover:underline">
            View all
          </Link>
        </div>
        <TableCard>
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>ID</th>
                <th className={th}>Customer</th>
                <th className={th}>Service</th>
                <th className={th}>When</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bookings.slice(0, 5).map((b) => (
                <tr key={b.id}>
                  <td className={`${td} font-mono text-xs`}>{b.id}</td>
                  <td className={`${td} font-medium`}>{b.customer}</td>
                  <td className={td}>{b.service}</td>
                  <td className={td}>
                    {b.date} · {b.time}
                  </td>
                  <td className={td}>
                    <StatusBadge status={b.status} />
                  </td>
                  <td className={`${td} text-right font-medium`}>{formatCurrency(b.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      </section>
    </>
  )
}
