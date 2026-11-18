import Link from 'next/link'
import { Star } from 'lucide-react'
import { PageHeader, TableCard, td, th } from '@/components/admin/admin-ui'
import { ServiceIcon } from '@/components/service-icon'
import { formatCurrency, services } from '@/lib/data'

export const metadata = { title: 'Services' }

export default function AdminServicesPage() {
  return (
    <>
      <PageHeader title="Services" description="Service catalog and starting prices shown to customers." />
      <TableCard>
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Service</th>
              <th className={th}>Tasks</th>
              <th className={th}>Duration</th>
              <th className={th}>Rating</th>
              <th className={`${th} text-right`}>Jobs done</th>
              <th className={`${th} text-right`}>From</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {services.map((s) => (
              <tr key={s.slug}>
                <td className={td}>
                  <Link href={`/services/${s.slug}`} className="inline-flex items-center gap-3 font-medium hover:underline">
                    <span className="inline-flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <ServiceIcon name={s.icon} className="size-4" />
                    </span>
                    {s.name}
                  </Link>
                </td>
                <td className={td}>{s.tasks.length}</td>
                <td className={td}>{s.duration}</td>
                <td className={td}>
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3.5 fill-primary text-primary" aria-hidden="true" />
                    {s.rating}
                  </span>
                </td>
                <td className={`${td} text-right`}>{s.jobsDone.toLocaleString('en-US')}</td>
                <td className={`${td} text-right font-medium`}>{formatCurrency(s.startingPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </>
  )
}
