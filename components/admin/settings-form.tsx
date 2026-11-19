'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveServiceArea, saveSettings } from '@/app/admin/actions'
import { cn } from '@/lib/utils'

const field = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'
// ISO weekdays, matching the database (Mon = 1 … Sun = 7).
const days: [number, string][] = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']]

type Area = { id: string; city: string; area_name: string; active_status: boolean }

export function SettingsForm({ settings: s, areas }: { settings: Record<string, any>; areas: Area[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [workDays, setWorkDays] = useState<number[]>(s.working_days ?? [])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const str = (k: string) => String(f.get(k) ?? '')
    start(async () => {
      const r = await saveSettings({
        business_name: str('business_name'),
        contact_email: str('contact_email'),
        contact_phone: str('contact_phone'),
        default_booking_fee: Number(str('default_booking_fee')),
        business_hours_start: str('business_hours_start'),
        business_hours_end: str('business_hours_end'),
        working_days: workDays,
        slot_capacity: Number(str('slot_capacity')),
        max_advance_days: Number(str('max_advance_days')),
        min_lead_hours: Number(str('min_lead_hours')),
        payment_hold_minutes: Number(str('payment_hold_minutes')),
        timezone: str('timezone'),
        cancellation_policy: str('cancellation_policy'),
        booking_rules: str('booking_rules'),
        notify_customer_email: f.get('notify_customer_email') === 'on',
        notify_admin_email: f.get('notify_admin_email') === 'on',
      })
      setMsg({ ok: r.ok, text: r.ok ? 'Settings saved.' : (r.message ?? 'Failed') })
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <form onSubmit={submit} className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-heading font-semibold">Business</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <L label="Business name"><input name="business_name" defaultValue={s.business_name} className={field} /></L>
          <L label="Contact email"><input name="contact_email" type="email" defaultValue={s.contact_email ?? ''} className={field} /></L>
          <L label="Contact phone"><input name="contact_phone" defaultValue={s.contact_phone ?? ''} className={field} /></L>
        </div>
        <h2 className="font-heading font-semibold">Booking rules</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <L label="Opens"><input name="business_hours_start" type="time" step={3600} defaultValue={String(s.business_hours_start).slice(0, 5)} className={field} /></L>
          <L label="Closes"><input name="business_hours_end" type="time" step={3600} defaultValue={String(s.business_hours_end).slice(0, 5)} className={field} /></L>
          <L label="Timezone (IANA)"><input name="timezone" defaultValue={s.timezone} className={field} /></L>
          <L label="Jobs per slot"><input name="slot_capacity" type="number" min={1} max={50} defaultValue={s.slot_capacity} className={field} /></L>
          <L label="Booking window (days)"><input name="max_advance_days" type="number" min={1} max={365} defaultValue={s.max_advance_days} className={field} /></L>
          <L label="Min. lead time (hours)"><input name="min_lead_hours" type="number" min={0} max={72} defaultValue={s.min_lead_hours} className={field} /></L>
          <L label={`Default booking fee (${s.currency})`}><input name="default_booking_fee" type="number" min={0} step="0.01" defaultValue={s.default_booking_fee} className={field} /></L>
          <L label="Payment hold (minutes)"><input name="payment_hold_minutes" type="number" min={10} max={180} defaultValue={s.payment_hold_minutes} className={field} /></L>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Working days</legend>
          <div className="flex flex-wrap gap-2">
            {days.map(([i, d]) => (
              <button
                key={d}
                type="button"
                aria-pressed={workDays.includes(i)}
                onClick={() => setWorkDays(workDays.includes(i) ? workDays.filter((x) => x !== i) : [...workDays, i])}
                className={cn('rounded-full border border-border px-3 py-1.5 text-xs font-medium', workDays.includes(i) && 'border-secondary bg-secondary text-secondary-foreground')}
              >
                {d}
              </button>
            ))}
          </div>
        </fieldset>
        <L label="Cancellation policy"><textarea name="cancellation_policy" rows={2} defaultValue={s.cancellation_policy ?? ''} className={`${field} h-auto py-2`} /></L>
        <L label="Booking rules"><textarea name="booking_rules" rows={2} defaultValue={s.booking_rules ?? ''} className={`${field} h-auto py-2`} /></L>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="notify_customer_email" defaultChecked={s.notify_customer_email} /> Send customer emails</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="notify_admin_email" defaultChecked={s.notify_admin_email} /> Send admin alert emails</label>
        </div>
        <p className="text-xs text-muted-foreground">Currency ({s.currency}) is fixed because Stripe prices are tied to it.</p>
        {msg && <p className={msg.ok ? 'text-sm text-chart-3' : 'text-sm text-destructive'}>{msg.text}</p>}
        <Button type="submit" size="lg" className="h-11 w-fit px-6 font-semibold" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save settings
        </Button>
      </form>
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-heading font-semibold">Service areas</h2>
        <ul className="flex flex-col gap-2">
          {areas.map((a) => (
            <AreaRow key={a.id} area={a} />
          ))}
        </ul>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add area</p>
        <AreaRow />
      </section>
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  )
}

function AreaRow({ area }: { area?: Area }) {
  const router = useRouter()
  const [city, setCity] = useState(area?.city ?? '')
  const [name, setName] = useState(area?.area_name ?? '')
  const [active, setActive] = useState(area?.active_status ?? true)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const dirty = area ? city !== area.city || name !== area.area_name || active !== area.active_status : city.trim().length > 1 && name.trim().length > 1
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" aria-label="City" className={`${field} h-9`} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Area" aria-label="Area" className={`${field} h-9`} />
        {area && <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} aria-label="Active" />}
        <Button
          size="sm"
          variant={area ? 'outline' : 'default'}
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const r = await saveServiceArea({ id: area?.id, city, area_name: name, active_status: active })
              if (!r.ok) return setError(r.message ?? 'Failed')
              if (!area) {
                setCity('')
                setName('')
              }
              router.refresh()
            })
          }
        >
          {area ? 'Save' : 'Add'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </li>
  )
}
