import { PageHeader, TableCard, td, th } from '@/components/admin/admin-ui'
import { customers, formatCurrency } from '@/lib/data'

export const metadata = { title: 'Customers' }

export default function AdminCustomersPage() {
  return (
    <>
      <PageHeader title="Customers" description={`${customers.length} customers with recent activity.`} />
      <TableCard>
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <th className={th}>Customer</th>
              <th className={th}>City</th>
              <th className={th}>Joined</th>
              <th className={`${th} text-right`}>Bookings</th>
              <th className={`${th} text-right`}>Lifetime spend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {customers.map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                </td>
                <td className={td}>{c.city}</td>
                <td className={td}>{c.joined}</td>
                <td className={`${td} text-right`}>{c.bookings}</td>
                <td className={`${td} text-right font-medium`}>{formatCurrency(c.spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </>
  )
}
