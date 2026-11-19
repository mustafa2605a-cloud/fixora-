import { PageHeader } from '@/components/admin/admin-ui'
import { SettingsForm } from '@/components/admin/settings-form'
import { serverClient } from '@/lib/insforge/server'

export const metadata = { title: 'Settings' }

export default async function AdminSettingsPage() {
  const client = await serverClient()
  const [{ data }, { data: areas }] = await Promise.all([
    client.database.from('business_settings').select('*').limit(1),
    client.database.from('service_areas').select('id, city, area_name, active_status').order('city').order('area_name'),
  ])
  const s = data?.[0]
  return (
    <>
      <PageHeader title="Settings" description="Business details, booking rules and service areas." />
      {s ? <SettingsForm settings={s} areas={areas ?? []} /> : <p className="text-sm text-muted-foreground">No settings row found.</p>}
    </>
  )
}
