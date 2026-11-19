import Link from 'next/link'
import { AlertTriangle, CalendarCheck, DollarSign, HardHat, Star } from 'lucide-react'
import { EmptyState, PageHeader, StatCard, StatusBadge, TableCard, td, th } from '@/components/admin/admin-ui'
import { MessageActions } from '@/components/admin/message-actions'
import { formatCurrency, formatTime } from '@/lib/data'
import { serverClient } from '@/lib/insforge/server'

export const metadata = { title: 'Overview' }

type Stats = {
  period_days: number
  bookings_in_period: number
  bookings_prev_period: number
  pending_bookings: number
  active_bookings: number
  completed_bookings: number
  cancelled_bookings: number
  failed_payments: number
  revenue_in_period: number
  revenue_prev_period: number
  revenue_total: number
  total_customers: number
  new_customers_in_period: number
  available_technicians: number
  total_technicians: number
  average_rating: number | null
  review_count: number
  popular_services: { name: string; bookings: number; revenue: number }[]
  monthly_revenue: { month: string; value: number }[]
  customer_growth: { month: string; value: number }[]
  technician_performance: { id: string; name: string; completed: number; active: number; rating: number | null }[]
}

function delta(current: number, previous: number, suffix: string) {
  if (!previous) return current ? `New this ${suffix}` : undefined
  const pct = ((current - previous) / previous) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs previous ${suffix}`
}

export default async function AdminOverviewPage() {
  const client = await serverClient()
  const [{ data: statsData, error }, { data: recent }, { data: messages }, { data: currencyRow }] = await Promise.all([
    client.database.rpc('admin_dashboard_stats', { p_days: 30 }),
    client.database
      .from('bookings')
      .select('id, booking_reference, guest_name, service_name_snapshot, task_name_snapshot, appointment_date, appointment_start_time, booking_status, total_amount, currency')
      .order('created_at', { ascending: false })
      .limit(6),
    client.database.from('contact_messages').select('id, name, email, message, status, created_at').eq('status', 'new').order('created_at', { ascending: false }).limit(5),
    client.database.from('business_settings').select('currency').limit(1),
  ])
  const currency = (currencyRow?.[0]?.currency as string) ?? 'USD'

  if (error || !statsData) {
    return (
      <>
        <PageHeader title="Overview" />
        <EmptyState>Could not load dashboard data: {error?.message ?? 'unknown error'}</EmptyState>
      </>
    )
  }
  const s = statsData as Stats
  const monthly = s.monthly_revenue.map((m) => ({ ...m, value: Number(m.value) }))
  const maxRevenue = Math.max(1, ...monthly.map((m) => m.value))
  const byService = s.popular_services.map((p) => ({ ...p, bookings: Number(p.bookings) }))
  const maxCount = Math.max(1, ...byService.map((p) => p.bookings))
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <>
      <PageHeader title="Overview" description={today} />
      {(s.failed_payments > 0 || s.pending_bookings > 0) && (
        <p className="mb-4 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
          <AlertTriangle className="size-4 text-primary" aria-hidden="true" />
          {s.pending_bookings} awaiting payment · {s.failed_payments} with failed/expired payment
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue (last 30 days)"
          value={formatCurrency(Number(s.revenue_in_period), currency)}
          delta={delta(Number(s.revenue_in_period), Number(s.revenue_prev_period), '30 days')}
          icon={DollarSign}
        />
        <StatCard
          label="Active bookings"
          value={String(s.active_bookings)}
          delta={`${s.bookings_in_period} new in 30 days · ${s.completed_bookings} completed`}
          icon={CalendarCheck}
        />
        <StatCard label="Technicians available" value={`${s.available_technicians} / ${s.total_technicians}`} icon={HardHat} />
        <StatCard
          label="Avg. rating"
          value={s.average_rating !== null ? Number(s.average_rating).toFixed(2) : '—'}
          delta={`${s.review_count} published reviews`}
          icon={Star}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading font-semibold">Monthly revenue</h2>
            <span className="text-xs text-muted-foreground">Net of refunds · total {formatCurrency(Number(s.revenue_total), currency)}</span>
          </div>
          <ul className="mt-6 flex h-56 items-end gap-3" aria-label="Monthly revenue chart">
            {monthly.map((m) => (
              <li key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-xs font-medium">
                  {m.value >= 1000 ? `${(m.value / 1000).toFixed(1)}k` : formatCurrency(m.value, currency)}
                </span>
                <div
                  className="w-full rounded-t-lg bg-primary"
                  style={{ height: `${Math.max((m.value / maxRevenue) * 80, m.value > 0 ? 2 : 0.5)}%` }}
                  aria-hidden="true"
                />
                <span className="text-xs text-muted-foreground">{m.month}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-heading font-semibold">Bookings by service</h2>
          <p className="text-xs text-muted-foreground">Last 30 days</p>
          <ul className="mt-6 flex flex-col gap-4">
            {byService.map((p) => (
              <li key={p.name} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="font-medium">{p.bookings}</span>
                </div>
                <div className="h-2 rounded-full bg-muted">
                  <div className="h-2 rounded-full bg-secondary" style={{ width: `${(p.bookings / maxCount) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-heading font-semibold">Customer growth</h2>
          <p className="text-xs text-muted-foreground">
            New paying customers per month · {s.total_customers} total · {s.new_customers_in_period} in last 30 days
          </p>
          <ul className="mt-6 flex h-32 items-end gap-3" aria-label="Customer growth chart">
            {s.customer_growth.map((m) => {
              const max = Math.max(1, ...s.customer_growth.map((x) => Number(x.value)))
              return (
                <li key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-xs font-medium">{m.value}</span>
                  <div className="w-full rounded-t-lg bg-secondary" style={{ height: `${Math.max((Number(m.value) / max) * 70, 1)}%` }} aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">{m.month}</span>
                </li>
              )
            })}
          </ul>
        </section>
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-heading font-semibold">Technician performance</h2>
          <ul className="mt-4 flex flex-col divide-y divide-border text-sm">
            {s.technician_performance.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 py-2.5">
                <Link href={`/admin/technicians/${t.id}`} className="font-medium hover:underline">
                  {t.name}
                </Link>
                <span className="text-muted-foreground">
                  {t.completed} done · {t.active} active · {t.rating !== null ? `${Number(t.rating).toFixed(1)}★` : 'no ratings'}
                </span>
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
        {recent && recent.length > 0 ? (
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
                {recent.map((b) => (
                  <tr key={b.id}>
                    <td className={`${td} font-mono text-xs`}>
                      <Link href={`/admin/bookings/${b.id}`} className="hover:underline">
                        {b.booking_reference}
                      </Link>
                    </td>
                    <td className={`${td} font-medium`}>{b.guest_name}</td>
                    <td className={td}>{b.service_name_snapshot}</td>
                    <td className={td}>
                      {b.appointment_date} · {formatTime(b.appointment_start_time)}
                    </td>
                    <td className={td}>
                      <StatusBadge status={b.booking_status} />
                    </td>
                    <td className={`${td} text-right font-medium`}>{formatCurrency(Number(b.total_amount), b.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        ) : (
          <EmptyState>No bookings yet.</EmptyState>
        )}
      </section>

      {messages && messages.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-heading font-semibold">New contact messages</h2>
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-sm sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium">
                    {m.name} <span className="font-normal text-muted-foreground">· {m.email}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{m.message}</p>
                </div>
                <MessageActions id={m.id} email={m.email} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
