import { PageHeader } from '@/components/admin/admin-ui'
import { BookingsTable } from '@/components/admin/bookings-table'

export const metadata = { title: 'Bookings' }

export default function AdminBookingsPage() {
  return (
    <>
      <PageHeader title="Bookings" description="Track, filter and update every job on the platform." />
      <BookingsTable />
    </>
  )
}
