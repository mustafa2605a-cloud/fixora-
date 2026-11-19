import Link from 'next/link'
import { Search } from 'lucide-react'
import { EmptyState, PageHeader, Pagination, TableCard, td, th } from '@/components/admin/admin-ui'
import { formatCurrency } from '@/lib/data'
import { serverClient } from '@/lib/insforge/server'

export const metadata = { title: 'Customers' }

const PAGE_SIZE = 25

type Customer = {
  email: string
  name: string
  phone: string
  city: string
  bookings: number
  paid_bookings: number
  completed_bookings: number
  spent: number
  first_booking_at: string
  last_booking_at: string
  has_account: boolean
}

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const q = (sp.q ?? '').trim().slice(0, 80)
  const client = await serverClient()
  const [{ data, error }, { data: settings }] = await Promise.all([
    client.database.rpc('admin_list_customers', { p_search: q || null, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE }),
    client.database.from('business_settings').select('currency').limit(1),
  ])
  const currency = (settings?.[0]?.currency as string) ?? 'USD'
  const result = (data ?? { total: 0, rows: [] }) as { total: number; rows: Customer[] }

  return (
    <>
      <PageHeader title="Customers" description={`${result.total} customers (guest checkouts grouped by email).`}>
        <form className="relative w-full sm:w-72">
          <label>
            <span className="sr-only">Search customers</span>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search name, email, phone"
              className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
        </form>
      </PageHeader>
      {error ? (
        <EmptyState>Could not load customers: {error.message}</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <TableCard>
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>Customer</th>
                  <th className={th}>City</th>
                  <th className={th}>First booking</th>
                  <th className={`${th} text-right`}>Bookings</th>
                  <th className={`${th} text-right`}>Completed</th>
                  <th className={`${th} text-right`}>Paid spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.rows.map((c) => (
                  <tr key={c.email}>
                    <td className={td}>
                      <Link href={`/admin/bookings?q=${encodeURIComponent(c.email)}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {c.email} · {c.phone}
                      </p>
                    </td>
                    <td className={td}>{c.city}</td>
                    <td className={td}>{new Date(c.first_booking_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                    <td className={`${td} text-right`}>{c.bookings}</td>
                    <td className={`${td} text-right`}>{c.completed_bookings}</td>
                    <td className={`${td} text-right font-medium`}>{formatCurrency(Number(c.spent), currency)}</td>
                  </tr>
                ))}
                {result.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No customers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableCard>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={result.total}
            hrefFor={(p) => `/admin/customers?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`}
          />
        </div>
      )}
    </>
  )
}
