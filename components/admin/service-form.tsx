'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ServiceIcon } from '@/components/service-icon'
import { saveService, saveTask, type ServiceInput } from '@/app/admin/actions'
import { formatCurrency, type ServiceCategory } from '@/lib/data'
import { cn } from '@/lib/utils'

const field = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
const ICONS = ['wrench', 'zap', 'snowflake', 'sparkles', 'hammer', 'paintbrush'] as const

export function ServiceForm({ initial, currency, defaultFee }: { initial?: ServiceInput; currency: string; defaultFee: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [icon, setIcon] = useState(initial?.icon ?? 'wrench')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const fee = String(f.get('booking_fee') ?? '').trim()
    const input: ServiceInput = {
      id: initial?.id,
      name: String(f.get('name') ?? ''),
      slug: String(f.get('slug') ?? ''),
      icon,
      short_description: String(f.get('short_description') ?? ''),
      description: String(f.get('description') ?? ''),
      estimated_duration: String(f.get('estimated_duration') ?? ''),
      starting_price: Number(f.get('starting_price')),
      booking_fee: fee === '' ? null : Number(fee),
      active_status: f.get('active_status') === 'on',
      includes: String(f.get('includes') ?? '').split('\n'),
    }
    start(async () => {
      const r = await saveService(input)
      setMessage({ ok: r.ok, text: r.ok ? 'Saved. The website updates within a minute.' : (r.message ?? 'Failed') })
      if (r.ok && !initial?.id && r.id) router.replace(`/admin/services/${r.id}`)
      else if (r.ok) router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-heading font-semibold">Details</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <input name="name" defaultValue={initial?.name} required maxLength={80} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          URL slug
          <input name="slug" defaultValue={initial?.slug} disabled={!!initial?.id} placeholder="auto from name" pattern="[a-z0-9-]*" maxLength={60} className={field} />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Icon</legend>
        <div className="flex flex-wrap gap-2">
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              aria-pressed={icon === i}
              aria-label={i}
              onClick={() => setIcon(i)}
              className={cn('inline-flex size-10 items-center justify-center rounded-lg border border-border', icon === i && 'border-primary bg-accent text-accent-foreground')}
            >
              <ServiceIcon name={i as ServiceCategory['icon']} className="size-4" />
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Short description
        <input name="short_description" defaultValue={initial?.short_description} maxLength={200} className={field} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Full description
        <textarea name="description" defaultValue={initial?.description} rows={3} maxLength={2000} className={`${field} h-auto py-2`} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Starting price ({currency})
          <input name="starting_price" type="number" min={0} step="0.01" defaultValue={initial?.starting_price ?? 0} required className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Booking fee
          <input name="booking_fee" type="number" min={0} step="0.01" defaultValue={initial?.booking_fee ?? ''} placeholder={`default ${formatCurrency(defaultFee, currency)}`} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Duration label
          <input name="estimated_duration" defaultValue={initial?.estimated_duration} placeholder="1–2 hours" maxLength={40} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        What’s included <span className="font-normal text-muted-foreground">(one per line)</span>
        <textarea name="includes" defaultValue={initial?.includes.join('\n')} rows={4} className={`${field} h-auto py-2`} />
      </label>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input name="active_status" type="checkbox" defaultChecked={initial?.active_status ?? true} className="size-4" />
        Active — visible and bookable (deactivating never deletes past bookings)
      </label>
      {message && <p className={message.ok ? 'text-sm text-chart-3' : 'text-sm text-destructive'}>{message.text}</p>}
      <Button type="submit" size="lg" className="h-11 w-fit px-6 font-semibold" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {initial?.id ? 'Save service' : 'Create service'}
      </Button>
    </form>
  )
}

type Task = { id?: string; name: string; price: number; duration_minutes: number | null; active_status: boolean }

export function TaskEditor({ serviceId, startingPrice, currency, tasks }: { serviceId: string; startingPrice: number; currency: string; tasks: Task[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div>
        <h2 className="font-heading font-semibold">Tasks & prices</h2>
        <p className="text-xs text-muted-foreground">
          Customer price per task (min. {formatCurrency(startingPrice, currency)}). The booking fee is added at checkout.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} serviceId={serviceId} startingPrice={startingPrice} />
        ))}
      </ul>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add task</p>
      <TaskRow task={{ name: '', price: startingPrice, duration_minutes: null, active_status: true }} serviceId={serviceId} startingPrice={startingPrice} isNew />
    </section>
  )
}

function TaskRow({ task, serviceId, startingPrice, isNew }: { task: Task; serviceId: string; startingPrice: number; isNew?: boolean }) {
  const router = useRouter()
  const [name, setName] = useState(task.name)
  const [price, setPrice] = useState(String(task.price))
  const [duration, setDuration] = useState(task.duration_minutes ? String(task.duration_minutes) : '')
  const [active, setActive] = useState(task.active_status)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const dirty = isNew ? name.trim().length > 1 : name !== task.name || Number(price) !== task.price || active !== task.active_status || duration !== (task.duration_minutes ? String(task.duration_minutes) : '')

  return (
    <li className={cn('flex flex-col gap-1', !active && !isNew && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Task name" maxLength={120} aria-label="Task name" className={`${field} h-9 min-w-40 flex-1`} />
        <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min={startingPrice} step="0.01" aria-label="Price" className={`${field} h-9 w-24`} />
        <input value={duration} onChange={(e) => setDuration(e.target.value)} type="number" min={15} step={15} placeholder="min" aria-label="Duration minutes" className={`${field} h-9 w-20`} />
        {!isNew && (
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
          </label>
        )}
        <Button
          size="sm"
          variant={isNew ? 'default' : 'outline'}
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await saveTask({
                id: task.id,
                service_id: serviceId,
                name,
                price: Number(price),
                starting_price: startingPrice,
                active_status: active,
                duration_minutes: duration ? Number(duration) : null,
              })
              if (!r.ok) return setError(r.message ?? 'Failed')
              if (isNew) {
                setName('')
                setPrice(String(startingPrice))
                setDuration('')
              }
              router.refresh()
            })
          }
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : isNew ? 'Add' : 'Save'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  )
}
