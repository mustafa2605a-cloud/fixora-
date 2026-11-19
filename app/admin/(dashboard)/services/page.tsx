import Link from 'next/link'
import { Plus, Star } from 'lucide-react'
import { EmptyState, PageHeader, StatusBadge, TableCard, td, th } from '@/components/admin/admin-ui'
import { ServiceIcon } from '@/components/service-icon'
import { buttonVariants } from '@/components/ui/button'
import { formatCurrency, type ServiceCategory } from '@/lib/data'
import { serverClient } from '@/lib/insforge/server'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Services' }

export default async function AdminServicesPage() {
  const client = await serverClient()
  const [{ data, error }, { data: done }, { data: reviews }, { data: settings }] = await Promise.all([
    client.database
      .from('services')
      .select('id, name, slug, icon, estimated_duration, starting_price, active_status, service_tasks(id, active_status)')
      .order('display_order'),
    client.database.from('bookings').select('service_id').eq('booking_status', 'completed'),
    client.database.from('reviews').select('service_id, rating').eq('visibility_status', 'published'),
    client.database.from('business_settings').select('currency').limit(1),
  ])
  const currency = (settings?.[0]?.currency as string) ?? 'USD'
  const jobs = new Map<string, number>()
  for (const b of done ?? []) jobs.set(b.service_id, (jobs.get(b.service_id) ?? 0) + 1)
  const ratings = new Map<string, number[]>()
  for (const r of reviews ?? []) ratings.set(r.service_id, [...(ratings.get(r.service_id) ?? []), Number(r.rating)])

  return (
    <>
      <PageHeader title="Services" description="Service catalog and starting prices shown to customers.">
        <Link href="/admin/services/new" className={cn(buttonVariants({ size: 'lg' }), 'px-4 font-semibold')}>
          <Plus className="size-4" aria-hidden="true" /> Add service
        </Link>
      </PageHeader>
      {error ? (
        <EmptyState>Could not load services: {error.message}</EmptyState>
      ) : (
        <TableCard>
          <table className="w-full">
            <thead className="border-b border-border">
              <tr>
                <th className={th}>Service</th>
                <th className={th}>Tasks</th>
                <th className={th}>Duration</th>
                <th className={th}>Rating</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>Jobs done</th>
                <th className={`${th} text-right`}>From</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(data ?? []).map((s: any) => {
                const r = ratings.get(s.id)
                return (
                  <tr key={s.id} className={s.active_status ? undefined : 'opacity-60'}>
                    <td className={td}>
                      <Link href={`/admin/services/${s.id}`} className="inline-flex items-center gap-3 font-medium hover:underline">
                        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                          <ServiceIcon name={s.icon as ServiceCategory['icon']} className="size-4" />
                        </span>
                        {s.name}
                      </Link>
                    </td>
                    <td className={td}>
                      {s.service_tasks.filter((t: any) => t.active_status).length}
                      <span className="text-muted-foreground"> / {s.service_tasks.length}</span>
                    </td>
                    <td className={td}>{s.estimated_duration ?? '—'}</td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-3.5 fill-primary text-primary" aria-hidden="true" />
                        {r?.length ? (r.reduce((a, b) => a + b, 0) / r.length).toFixed(1) : 'New'}
                      </span>
                    </td>
                    <td className={td}>
                      <StatusBadge status={s.active_status ? 'active' : 'inactive'} />
                    </td>
                    <td className={`${td} text-right`}>{(jobs.get(s.id) ?? 0).toLocaleString('en-US')}</td>
                    <td className={`${td} text-right font-medium`}>{formatCurrency(Number(s.starting_price), currency)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableCard>
      )}
    </>
  )
}
