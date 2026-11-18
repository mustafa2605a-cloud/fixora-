import { Phone, Star } from 'lucide-react'
import { PageHeader, StatusBadge } from '@/components/admin/admin-ui'
import { technicians } from '@/lib/data'

export const metadata = { title: 'Technicians' }

export default function AdminTechniciansPage() {
  return (
    <>
      <PageHeader title="Technicians" description={`${technicians.length} verified professionals on the team.`} />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {technicians.map((t) => (
          <li key={t.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-secondary font-heading font-semibold text-secondary-foreground">
                {t.initials}
              </span>
              <div className="flex-1">
                <p className="font-semibold">{t.name}</p>
                <p className="text-sm text-muted-foreground">{t.specialty}</p>
              </div>
              <StatusBadge status={t.status} />
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted p-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Rating</dt>
                <dd className="inline-flex items-center gap-1 font-semibold">
                  <Star className="size-3.5 fill-primary text-primary" aria-hidden="true" />
                  {t.rating}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Jobs done</dt>
                <dd className="font-semibold">{t.jobs}</dd>
              </div>
            </dl>
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="size-4" aria-hidden="true" />
              {t.phone}
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}
