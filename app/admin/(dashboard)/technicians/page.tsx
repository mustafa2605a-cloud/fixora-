import Link from 'next/link'
import { Phone, Plus, Star } from 'lucide-react'
import { EmptyState, PageHeader, StatusBadge } from '@/components/admin/admin-ui'
import { buttonVariants } from '@/components/ui/button'
import { serverClient } from '@/lib/insforge/server'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Technicians' }

export default async function AdminTechniciansPage() {
  const client = await serverClient()
  const [{ data: techs, error }, { data: jobs }] = await Promise.all([
    client.database
      .from('technicians')
      .select('id, full_name, phone, specialization, availability_status, active_status, average_rating, technician_skills(service:services(name))')
      .order('active_status', { ascending: false })
      .order('full_name'),
    client.database.from('bookings').select('assigned_technician_id').eq('booking_status', 'completed').not('assigned_technician_id', 'is', null),
  ])
  const done = new Map<string, number>()
  for (const j of jobs ?? []) done.set(j.assigned_technician_id, (done.get(j.assigned_technician_id) ?? 0) + 1)
  const list = (techs ?? []) as any[]
  const active = list.filter((t) => t.active_status).length

  return (
    <>
      <PageHeader title="Technicians" description={`${active} active professionals on the team.`}>
        <Link href="/admin/technicians/new" className={cn(buttonVariants({ size: 'lg' }), 'px-4 font-semibold')}>
          <Plus className="size-4" aria-hidden="true" /> Add technician
        </Link>
      </PageHeader>
      {error && <EmptyState>Could not load technicians: {error.message}</EmptyState>}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((t) => {
          const initials = t.full_name.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase()
          const skills = Array.from(new Set((t.technician_skills ?? []).map((s: any) => s.service?.name).filter(Boolean))) as string[]
          return (
            <li key={t.id} className={cn('rounded-2xl border border-border bg-card', !t.active_status && 'opacity-60')}>
              <Link href={`/admin/technicians/${t.id}`} className="flex flex-col gap-4 p-5 hover:bg-muted/30">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-12 items-center justify-center rounded-full bg-secondary font-heading font-semibold text-secondary-foreground">
                    {initials}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold">{t.full_name}</p>
                    <p className="text-sm text-muted-foreground">{t.specialization ?? (skills.join(', ') || 'No skills yet')}</p>
                  </div>
                  <StatusBadge status={t.active_status ? t.availability_status : 'inactive'} />
                </div>
                <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted p-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Rating</dt>
                    <dd className="inline-flex items-center gap-1 font-semibold">
                      <Star className="size-3.5 fill-primary text-primary" aria-hidden="true" />
                      {Number(t.average_rating) > 0 ? Number(t.average_rating).toFixed(1) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Jobs done</dt>
                    <dd className="font-semibold">{done.get(t.id) ?? 0}</dd>
                  </div>
                </dl>
                <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="size-4" aria-hidden="true" />
                  {t.phone}
                </p>
              </Link>
            </li>
          )
        })}
      </ul>
    </>
  )
}
