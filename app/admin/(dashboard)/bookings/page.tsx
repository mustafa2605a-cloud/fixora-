import { PageHeader } from '@/components/admin/admin-ui'
import { BookingsTable, type BookingRow } from '@/components/admin/bookings-table'
import { serverClient } from '@/lib/insforge/server'

export const metadata = { title: 'Bookings' }

const PAGE_SIZE = 20
const STATUSES = ['pending_payment', 'confirmed', 'technician_assigned', 'in_progress', 'completed', 'cancelled', 'rejected', 'payment_failed']
const SORTS: Record<string, { column: string; ascending: boolean }> = {
  newest: { column: 'created_at', ascending: false },
  oldest: { column: 'created_at', ascending: true },
  appointment: { column: 'appointment_date', ascending: true },
  appointment_desc: { column: 'appointment_date', ascending: false },
  amount: { column: 'total_amount', ascending: false },
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; page?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const status = STATUSES.includes(sp.status ?? '') ? sp.status! : 'all'
  const sort = SORTS[sp.sort ?? ''] ? sp.sort! : 'newest'
  const q = (sp.q ?? '').trim().slice(0, 80).replace(/[%,()*]/g, ' ')

  const client = await serverClient()
  let query = client.database
    .from('bookings')
    .select(
      'id, booking_reference, guest_name, guest_email, guest_phone, area, city, service_name_snapshot, task_name_snapshot, appointment_date, appointment_start_time, booking_status, payment_status, total_amount, currency, created_at, technician:technicians!bookings_assigned_technician_id_fkey(full_name)',
      { count: 'exact' },
    )
  if (status !== 'all') query = query.eq('booking_status', status)
  if (q) {
    query = query.or(
      `booking_reference.ilike.%${q}%,guest_name.ilike.%${q}%,guest_email.ilike.%${q}%,guest_phone.ilike.%${q}%,service_name_snapshot.ilike.%${q}%`,
    )
  }
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) query = query.gte('appointment_date', sp.from)
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) query = query.lte('appointment_date', sp.to)
  const { column, ascending } = SORTS[sort]
  const { data, count, error } = await query
    .order(column, { ascending })
    .order('appointment_start_time', { ascending: true })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  return (
    <>
      <PageHeader title="Bookings" description="Track, filter and update every job on the platform." />
      <BookingsTable
        rows={(data ?? []) as unknown as BookingRow[]}
        total={count ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        filters={{ q: sp.q ?? '', status, sort, from: sp.from ?? '', to: sp.to ?? '' }}
        error={error?.message}
      />
    </>
  )
}
