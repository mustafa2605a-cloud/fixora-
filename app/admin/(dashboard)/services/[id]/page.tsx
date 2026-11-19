import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/admin/admin-ui'
import { ServiceForm, TaskEditor } from '@/components/admin/service-form'
import { serverClient } from '@/lib/insforge/server'

export const metadata = { title: 'Service' }

export default async function ServiceEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isNew = id === 'new'
  if (!isNew && !/^[0-9a-f-]{36}$/.test(id)) notFound()
  const client = await serverClient()
  const [{ data: settings }, serviceRes] = await Promise.all([
    client.database.from('business_settings').select('currency, default_booking_fee').limit(1),
    isNew
      ? Promise.resolve({ data: null })
      : client.database
          .from('services')
          .select('*, service_tasks(id, name, additional_price, duration_minutes, active_status, display_order)')
          .eq('id', id)
          .limit(1),
  ])
  const service = (serviceRes.data as any[] | null)?.[0]
  if (!isNew && !service) notFound()
  const currency = (settings?.[0]?.currency as string) ?? 'USD'
  const defaultFee = Number(settings?.[0]?.default_booking_fee ?? 0)

  return (
    <>
      <Link href="/admin/services" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> All services
      </Link>
      <PageHeader
        title={isNew ? 'Add service' : service.name}
        description={isNew ? 'New services appear on the website once active and given at least one task.' : `/services/${service.slug}`}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <ServiceForm
          currency={currency}
          defaultFee={defaultFee}
          initial={
            service
              ? {
                  id: service.id,
                  name: service.name,
                  slug: service.slug,
                  icon: service.icon,
                  short_description: service.short_description ?? '',
                  description: service.description ?? '',
                  estimated_duration: service.estimated_duration ?? '',
                  starting_price: Number(service.starting_price),
                  booking_fee: service.booking_fee === null ? null : Number(service.booking_fee),
                  active_status: service.active_status,
                  includes: service.includes ?? [],
                }
              : undefined
          }
        />
        {service && (
          <TaskEditor
            serviceId={service.id}
            startingPrice={Number(service.starting_price)}
            currency={currency}
            tasks={[...service.service_tasks]
              .sort((a: any, b: any) => a.display_order - b.display_order || a.name.localeCompare(b.name))
              .map((t: any) => ({
                id: t.id,
                name: t.name,
                price: Number(service.starting_price) + Number(t.additional_price),
                duration_minutes: t.duration_minutes,
                active_status: t.active_status,
              }))}
          />
        )}
      </div>
    </>
  )
}
