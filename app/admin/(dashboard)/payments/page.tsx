import Link from 'next/link'
import { EmptyState, PageHeader, Pagination, StatCard, StatusBadge, TableCard, td, th } from '@/components/admin/admin-ui'
import { EmailRetryButton } from '@/components/admin/booking-misc'
import { formatCurrency } from '@/lib/data'
import { serverClient } from '@/lib/insforge/server'
import { AlertTriangle, CreditCard, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Payments' }

const PAGE_SIZE = 25
const STATUSES = ['pending', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded']

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; tab?: string }> }) {
  const sp = await searchParams
  const tab = sp.tab === 'events' || sp.tab === 'emails' ? sp.tab : 'payments'
  const page = Math.max(1, Number(sp.page) || 1)
  const status = STATUSES.includes(sp.status ?? '') ? sp.status! : 'all'
  const client = await serverClient()

  const [{ data: allPays }, { data: settings }] = await Promise.all([
    client.database.from('payments').select('amount, refunded_amount, payment_status'),
    client.database.from('business_settings').select('currency').limit(1),
  ])
  const currency = (settings?.[0]?.currency as string) ?? 'USD'
  const ok = (allPays ?? []).filter((p) => ['succeeded', 'refunded', 'partially_refunded'].includes(p.payment_status))
  const gross = ok.reduce((a, p) => a + Number(p.amount), 0)
  const refunded = ok.reduce((a, p) => a + Number(p.refunded_amount ?? 0), 0)
  const failed = (allPays ?? []).filter((p) => p.payment_status === 'failed' || p.payment_status === 'cancelled').length

  const tabs = [
    ['payments', 'Transactions'],
    ['events', 'Webhook events'],
    ['emails', 'Email log'],
  ] as const

  return (
    <>
      <PageHeader title="Payments" description="Stripe test-mode transactions, verified via signed webhooks only." />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Net collected" value={formatCurrency(gross - refunded, currency)} delta={`${ok.length} successful payments`} icon={CreditCard} />
        <StatCard label="Refunded" value={formatCurrency(refunded, currency)} icon={RotateCcw} />
        <StatCard label="Failed / expired checkouts" value={String(failed)} icon={AlertTriangle} />
      </div>
      <div className="mt-6 mb-4 flex gap-2">
        {tabs.map(([k, l]) => (
          <Link
            key={k}
            href={`/admin/payments?tab=${k}`}
            className={cn('rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium', tab === k && 'border-secondary bg-secondary text-secondary-foreground')}
          >
            {l}
          </Link>
        ))}
      </div>
      {tab === 'payments' && <Transactions client={client} page={page} status={status} />}
      {tab === 'events' && <Events client={client} page={page} />}
      {tab === 'emails' && <Emails client={client} page={page} />}
    </>
  )
}

type Client = Awaited<ReturnType<typeof serverClient>>

async function Transactions({ client, page, status }: { client: Client; page: number; status: string }) {
  let q = client.database
    .from('payments')
    .select('id, provider, provider_transaction_id, checkout_session_id, amount, refunded_amount, currency, payment_method, payment_status, created_at, paid_at, booking:bookings(id, booking_reference, guest_name)', { count: 'exact' })
  if (status !== 'all') q = q.eq('payment_status', status)
  const { data, count, error } = await q.order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (error) return <EmptyState>Could not load payments: {error.message}</EmptyState>
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {['all', ...STATUSES].map((s) => (
          <Link
            key={s}
            href={s === 'all' ? '/admin/payments' : `/admin/payments?status=${s}`}
            className={cn('rounded-full border border-border bg-card px-3 py-1 text-xs', status === s && 'border-secondary bg-secondary text-secondary-foreground')}
          >
            {s === 'all' ? 'All' : s.replace('_', ' ')}
          </Link>
        ))}
      </div>
      <TableCard>
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Booking</th>
              <th className={th}>Transaction</th>
              <th className={th}>Method</th>
              <th className={th}>Date</th>
              <th className={th}>Status</th>
              <th className={`${th} text-right`}>Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data ?? []).map((p: any) => (
              <tr key={p.id}>
                <td className={td}>
                  <Link href={`/admin/bookings/${p.booking?.id}`} className="font-mono text-xs hover:underline">
                    {p.booking?.booking_reference}
                  </Link>
                  <p className="text-xs text-muted-foreground">{p.booking?.guest_name}</p>
                </td>
                <td className={`${td} max-w-48 truncate font-mono text-xs`} title={p.provider_transaction_id ?? p.checkout_session_id ?? ''}>
                  {p.provider_transaction_id ?? p.checkout_session_id ?? '—'}
                </td>
                <td className={td}>{p.payment_method ?? p.provider}</td>
                <td className={td}>{new Date(p.paid_at ?? p.created_at).toLocaleString('en-US')}</td>
                <td className={td}>
                  <StatusBadge status={p.payment_status} />
                </td>
                <td className={`${td} text-right font-medium`}>
                  {formatCurrency(Number(p.amount), p.currency)}
                  {Number(p.refunded_amount) > 0 && <p className="text-xs font-normal text-muted-foreground">−{formatCurrency(Number(p.refunded_amount), p.currency)}</p>}
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No payments yet. Payments appear once Stripe test keys are configured and customers check out.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableCard>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(n) => `/admin/payments?${new URLSearchParams({ ...(status !== 'all' ? { status } : {}), page: String(n) })}`} />
    </div>
  )
}

async function Events({ client, page }: { client: Client; page: number }) {
  const { data, count, error } = await client.database
    .from('payment_event_log')
    .select('provider, provider_event_id, event_type, outcome, error_message, processed_at, booking:bookings(id, booking_reference)', { count: 'exact' })
    .order('processed_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (error) return <EmptyState>Could not load events: {error.message}</EmptyState>
  return (
    <div className="flex flex-col gap-4">
      <TableCard>
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Event</th>
              <th className={th}>Booking</th>
              <th className={th}>Outcome</th>
              <th className={th}>Processed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data ?? []).map((e: any) => (
              <tr key={e.provider + e.provider_event_id}>
                <td className={td}>
                  <p>{e.event_type}</p>
                  <p className="font-mono text-xs text-muted-foreground">{e.provider_event_id}</p>
                </td>
                <td className={td}>
                  {e.booking ? (
                    <Link href={`/admin/bookings/${e.booking.id}`} className="font-mono text-xs hover:underline">
                      {e.booking.booking_reference}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={td}>
                  <span className={['error', 'amount_mismatch', 'unknown_booking'].includes(e.outcome) ? 'text-destructive' : undefined}>{e.outcome}</span>
                  {e.error_message && <p className="text-xs text-destructive">{e.error_message}</p>}
                </td>
                <td className={td}>{new Date(e.processed_at).toLocaleString('en-US')}</td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No webhook events processed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableCard>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(n) => `/admin/payments?tab=events&page=${n}`} />
    </div>
  )
}

async function Emails({ client, page }: { client: Client; page: number }) {
  const { data, count, error } = await client.database
    .from('email_logs')
    .select('id, booking_id, recipient_email, recipient_type, email_type, delivery_status, error_message, attempts, created_at, sent_at, booking:bookings(booking_reference)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (error) return <EmptyState>Could not load email log: {error.message}</EmptyState>
  return (
    <div className="flex flex-col gap-4">
      <TableCard>
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Email</th>
              <th className={th}>Recipient</th>
              <th className={th}>Booking</th>
              <th className={th}>Status</th>
              <th className={th}>Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(data ?? []).map((e: any) => (
              <tr key={e.id}>
                <td className={td}>{e.email_type.replace(/_/g, ' ')}</td>
                <td className={td}>
                  {e.recipient_email}
                  <p className="text-xs text-muted-foreground">{e.recipient_type}</p>
                </td>
                <td className={td}>
                  {e.booking_id ? (
                    <Link href={`/admin/bookings/${e.booking_id}`} className="font-mono text-xs hover:underline">
                      {e.booking?.booking_reference}
                    </Link>
                  ) : (
                    '—'
                  )}
                </td>
                <td className={td}>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={e.delivery_status} />
                    {(e.delivery_status === 'failed' || e.delivery_status === 'skipped') && <EmailRetryButton id={e.id} bookingId={e.booking_id} />}
                  </span>
                  {e.error_message && <p className="mt-1 max-w-64 truncate text-xs text-destructive" title={e.error_message}>{e.error_message}</p>}
                </td>
                <td className={td}>
                  {new Date(e.created_at).toLocaleString('en-US')}
                  <p className="text-xs text-muted-foreground">{e.attempts} attempts</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} hrefFor={(n) => `/admin/payments?tab=emails&page=${n}`} />
    </div>
  )
}
