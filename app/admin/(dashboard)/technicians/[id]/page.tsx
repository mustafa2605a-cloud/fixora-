import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader, StatusBadge, TableCard, td, th } from '@/components/admin/admin-ui'
import { TechnicianForm } from '@/components/admin/technician-form'
import { formatTime } from '@/lib/data'
import { serverClient } from '@/lib/insforge/server'

export const metadata = { title: 'Technician' }

export default async function TechnicianPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isNew = id === 'new'
  if (!isNew && !/^[0-9a-f-]{36}$/.test(id)) notFound()
  const client = await serverClient()
  const { data: services } = await client.database
    .from('services')
    .select('id, name, service_tasks(id, name, active_status)')
    .order('display_order')
  let tech: any = null
  let history: any[] = []
  if (!isNew) {
    const { data } = await client.database.from('technicians').select('*, technician_skills(service_id, task_id)').eq('id', id).limit(1)
    tech = data?.[0]
    if (!tech) notFound()
    const { data: h } = await client.database
      .from('technician_assignments')
      .select('id, assignment_status, assigned_at, booking:bookings(id, booking_reference, service_name_snapshot, appointment_date, appointment_start_time, booking_status)')
      .eq('technician_id', id)
      .order('assigned_at', { ascending: false })
      .limit(50)
    history = h ?? []
  }

  return (
    <>
      <Link href="/admin/technicians" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> All technicians
      </Link>
      <PageHeader title={isNew ? 'Add technician' : tech.full_name} description={isNew ? 'Technicians do not get logins; you assign their jobs.' : undefined} />
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <TechnicianForm
          services={(services ?? []) as any}
          initial={
            tech
              ? {
                  id: tech.id,
                  full_name: tech.full_name,
                  phone: tech.phone,
                  email: tech.email ?? '',
                  specialization: tech.specialization ?? '',
                  description: tech.description ?? '',
                  availability_status: tech.availability_status,
                  active_status: tech.active_status,
                  skills: tech.technician_skills,
                }
              : undefined
          }
        />
        {!isNew && (
          <section>
            <h2 className="mb-3 font-heading font-semibold">Assignment history</h2>
            <TableCard>
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr>
                    <th className={th}>Booking</th>
                    <th className={th}>When</th>
                    <th className={th}>Assignment</th>
                    <th className={th}>Booking status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className={td}>
                        <Link href={`/admin/bookings/${h.booking?.id}`} className="font-mono text-xs hover:underline">
                          {h.booking?.booking_reference}
                        </Link>
                        <p className="text-xs text-muted-foreground">{h.booking?.service_name_snapshot}</p>
                      </td>
                      <td className={td}>
                        {h.booking?.appointment_date} · {h.booking ? formatTime(h.booking.appointment_start_time) : ''}
                      </td>
                      <td className={td}>{h.assignment_status}</td>
                      <td className={td}>{h.booking && <StatusBadge status={h.booking.booking_status} />}</td>
                    </tr>
                  ))}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No assignments yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableCard>
          </section>
        )}
      </div>
    </>
  )
}
