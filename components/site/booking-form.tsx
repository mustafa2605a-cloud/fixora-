'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ServiceIcon } from '@/components/service-icon'
import { formatCurrency, formatTime, type ServiceCategory } from '@/lib/data'
import { functionUrl } from '@/lib/insforge/config'
import { publicClient } from '@/lib/insforge/public'
import { rememberBookingToken } from '@/lib/booking-token'
import { cn } from '@/lib/utils'

const fieldClass =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

type Area = { city: string; area_name: string }
type Slot = { start_time: string; remaining: number; available: boolean; reason: string | null }
type Settings = { currency: string; max_advance_days: number; working_days: number[] } | null

const MAX_PHOTOS = 5
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function bookableDays(count: number, workingDays: number[]) {
  const days: { value: string; weekday: string; day: string }[] = []
  const base = new Date()
  for (let i = 0; days.length < count && i < count * 2; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    const isoDow = d.getDay() === 0 ? 7 : d.getDay()
    if (!workingDays.includes(isoDow)) continue
    days.push({
      value: isoDate(d),
      weekday: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' }),
      day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })
  }
  return days
}

function newIdempotencyKey() {
  return `bk-${crypto.randomUUID()}`
}

export function BookingForm({
  services,
  areas,
  settings,
  initialService,
}: {
  services: ServiceCategory[]
  areas: Area[]
  settings: Settings
  initialService?: string
}) {
  const router = useRouter()
  const currency = settings?.currency ?? 'USD'
  const [serviceSlug, setServiceSlug] = useState(
    services.some((s) => s.slug === initialService) ? initialService! : services[0]?.slug,
  )
  const service = services.find((s) => s.slug === serviceSlug) ?? services[0]
  const [taskId, setTaskId] = useState(service?.tasks[0]?.id ?? '')
  const days = useMemo(
    () => bookableDays(Math.min(settings?.max_advance_days ?? 14, 14), settings?.working_days ?? [1, 2, 3, 4, 5, 6]),
    [settings],
  )
  const [date, setDate] = useState(days[0]?.value ?? '')
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const cities = useMemo(() => Array.from(new Set(areas.map((a) => a.city))), [areas])
  const [city, setCity] = useState(cities[0] ?? '')
  const cityAreas = areas.filter((a) => a.city === city)
  const [photos, setPhotos] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'uploading' | 'redirecting'>('idle')
  const idempotencyKey = useRef<string>('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    idempotencyKey.current = newIdempotencyKey()
  }, [])

  // Live availability for the chosen day (server decides capacity/lead time).
  useEffect(() => {
    if (!date) return
    let cancelled = false
    setSlots(null)
    setSlotsError(null)
    publicClient()
      .database.rpc('get_availability', { p_date: date })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return
        if (rpcError) {
          setSlotsError('Could not load available times. Please refresh.')
          return
        }
        const list = (data ?? []) as Slot[]
        setSlots(list)
        setTime((current) => {
          const still = list.find((s) => s.start_time.startsWith(current ?? '--') && s.available)
          return still ? current : (list.find((s) => s.available)?.start_time.slice(0, 5) ?? null)
        })
      })
    return () => {
      cancelled = true
    }
  }, [date])

  if (!service) {
    return <p className="text-muted-foreground">Online booking is temporarily unavailable. Please contact us.</p>
  }

  const task = service.tasks.find((t) => t.id === taskId) ?? service.tasks[0]
  const servicePrice = task?.price ?? service.startingPrice
  const fee = service.bookingFee
  const busy = status !== 'idle'

  function selectService(slug: string) {
    setServiceSlug(slug)
    setTaskId(services.find((s) => s.slug === slug)?.tasks[0]?.id ?? '')
  }

  function addPhotos(list: FileList | null) {
    if (!list) return
    const next = [...photos]
    for (const f of Array.from(list)) {
      if (!PHOTO_TYPES.includes(f.type)) {
        setError('Photos must be JPG, PNG or WebP.')
        continue
      }
      if (f.size > MAX_PHOTO_BYTES) {
        setError('Each photo must be under 5 MB.')
        continue
      }
      if (next.length >= MAX_PHOTOS) break
      next.push(f)
    }
    setPhotos(next)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const data = new FormData(e.currentTarget)
    const get = (k: string) => String(data.get(k) ?? '').trim()
    const booking = {
      serviceId: service.id,
      taskId: task?.id ?? null,
      description: get('description'),
      fullName: get('name'),
      email: get('email'),
      phone: get('phone'),
      city,
      area: get('area'),
      address: get('address'),
      building: get('building'),
      apartment: get('apartment'),
      directions: get('directions'),
      notes: get('notes'),
      date,
      time,
    }
    if (booking.fullName.length < 2) return setError('Please enter your full name.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(booking.email)) return setError('Please enter a valid email address.')
    if (booking.phone.replace(/\D/g, '').length < 6) return setError('Please enter a valid phone number.')
    if (!booking.city || !booking.area) return setError('Please choose your city and area.')
    if (booking.address.length < 5) return setError('Please enter your street and building.')
    if (!booking.time) return setError('Please choose an available time slot.')
    setError(null)
    setStatus('submitting')

    try {
      const res = await fetch(functionUrl('booking-api'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', idempotencyKey: idempotencyKey.current, booking }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.reference) {
        setStatus('idle')
        if (body.error !== 'duplicate_submission') idempotencyKey.current = newIdempotencyKey()
        setError(body.message ?? 'Something went wrong. Please try again.')
        if (body.error?.startsWith('slot')) {
          const { data: fresh } = await publicClient().database.rpc('get_availability', { p_date: date })
          setSlots((fresh ?? []) as Slot[])
        }
        return
      }

      rememberBookingToken(body.reference, body.token)

      if (photos.length) {
        setStatus('uploading')
        for (const photo of photos) {
          const fd = new FormData()
          fd.set('reference', body.reference)
          fd.set('token', body.token)
          fd.set('file', photo)
          await fetch(functionUrl('booking-upload'), { method: 'POST', body: fd }).catch(() => null)
        }
      }

      setStatus('redirecting')
      if (body.checkoutUrl) {
        window.location.assign(body.checkoutUrl)
      } else {
        router.push(`/booking/${encodeURIComponent(body.reference)}?checkout=unavailable#${body.token}`)
      }
    } catch {
      setStatus('idle')
      setError('Network error. Please check your connection and try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1.6fr_1fr]" noValidate>
      <div className="flex flex-col gap-8">
        <fieldset className="flex flex-col gap-4" disabled={busy}>
          <legend className="mb-4 font-heading text-lg font-semibold">1. Choose a service</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {services.map((s) => (
              <label
                key={s.slug}
                className={cn(
                  'flex cursor-pointer flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                  s.slug === serviceSlug && 'border-primary bg-accent',
                )}
              >
                <input
                  type="radio"
                  name="service"
                  value={s.slug}
                  checked={s.slug === serviceSlug}
                  onChange={() => selectService(s.slug)}
                  className="sr-only"
                />
                <ServiceIcon name={s.icon} className="size-5 text-accent-foreground" />
                {s.name}
              </label>
            ))}
          </div>
          {service.tasks.length > 0 && (
            <label className="flex flex-col gap-2 text-sm font-medium">
              Task
              <select value={task?.id} onChange={(e) => setTaskId(e.target.value)} className={fieldClass}>
                {service.tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {formatCurrency(t.price, currency)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-2 text-sm font-medium">
            Describe the problem <span className="font-normal text-muted-foreground">(optional)</span>
            <textarea
              name="description"
              rows={3}
              maxLength={2000}
              placeholder="e.g. Kitchen sink drains slowly and smells"
              className={cn(fieldClass, 'h-auto py-2')}
            />
          </label>
        </fieldset>

        <fieldset disabled={busy}>
          <legend className="mb-4 font-heading text-lg font-semibold">2. Pick a date &amp; time</legend>
          <div className="flex gap-2 overflow-x-auto pb-2" role="radiogroup" aria-label="Date">
            {days.map((d) => (
              <button
                type="button"
                key={d.value}
                role="radio"
                aria-checked={d.value === date}
                onClick={() => setDate(d.value)}
                className={cn(
                  'flex min-w-20 flex-col items-center rounded-xl border border-border bg-card px-3 py-3 text-sm',
                  d.value === date && 'border-secondary bg-secondary text-secondary-foreground',
                )}
              >
                <span className="text-xs opacity-70">{d.weekday}</span>
                <span className="font-semibold">{d.day}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Arrival time">
            {slots === null && !slotsError &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg border border-border bg-muted" aria-hidden="true" />
              ))}
            {slots?.map((s) => {
              const value = s.start_time.slice(0, 5)
              return (
                <button
                  type="button"
                  key={value}
                  role="radio"
                  aria-checked={value === time}
                  disabled={!s.available}
                  title={!s.available ? (s.reason === 'full' ? 'Fully booked' : 'Not available') : `${s.remaining} left`}
                  onClick={() => setTime(value)}
                  className={cn(
                    'rounded-lg border border-border bg-card py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through',
                    value === time && 'border-primary bg-primary text-primary-foreground',
                  )}
                >
                  {formatTime(value)}
                </button>
              )
            })}
          </div>
          {slotsError && <p className="mt-2 text-sm text-destructive">{slotsError}</p>}
          {slots && !slots.some((s) => s.available) && (
            <p className="mt-2 text-sm text-muted-foreground">No times left on this day — please pick another date.</p>
          )}
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2" disabled={busy}>
          <legend className="mb-4 font-heading text-lg font-semibold">3. Your details</legend>
          <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
            Full name
            <input name="name" autoComplete="name" required maxLength={120} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Email
            <input name="email" type="email" autoComplete="email" required maxLength={254} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Phone
            <input name="phone" type="tel" autoComplete="tel" required maxLength={40} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            City
            <select value={city} onChange={(e) => setCity(e.target.value)} className={fieldClass} autoComplete="address-level2">
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Area
            <select key={city} name="area" required className={fieldClass} defaultValue="">
              <option value="" disabled>
                Select area
              </option>
              {cityAreas.map((a) => (
                <option key={a.area_name}>{a.area_name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
            Street &amp; building
            <input name="address" autoComplete="street-address" required maxLength={300} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Apartment / villa no. <span className="font-normal text-muted-foreground">(optional)</span>
            <input name="apartment" maxLength={50} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Building name <span className="font-normal text-muted-foreground">(optional)</span>
            <input name="building" maxLength={100} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
            Directions <span className="font-normal text-muted-foreground">(optional)</span>
            <input name="directions" maxLength={500} placeholder="Landmarks, gate code, parking…" className={fieldClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
            Notes for the technician <span className="font-normal text-muted-foreground">(optional)</span>
            <textarea name="notes" rows={3} maxLength={2000} className={cn(fieldClass, 'h-auto py-2')} />
          </label>
          <div className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
            <span>
              Photos <span className="font-normal text-muted-foreground">(optional, up to 5 · JPG, PNG, WebP · 5 MB each)</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <span key={`${p.name}-${i}`} className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-normal">
                  {p.name.length > 24 ? `${p.name.slice(0, 21)}…` : p.name}
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              {photos.length < MAX_PHOTOS && (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-card px-3 py-2 text-xs font-medium hover:bg-muted">
                  <ImagePlus className="size-4" aria-hidden="true" />
                  Add photo
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    onChange={(e) => addPhotos(e.target.files)}
                  />
                </label>
              )}
            </div>
          </div>
        </fieldset>
      </div>

      <aside className="h-fit rounded-3xl border border-border bg-card p-6 lg:sticky lg:top-24">
        <h2 className="font-heading text-lg font-semibold">Summary</h2>
        <dl className="mt-4 flex flex-col gap-3 text-sm">
          <Row label="Service" value={service.name} />
          {task && <Row label="Task" value={task.name} />}
          <Row
            label="Date"
            value={date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
          />
          <Row label="Arrival" value={time ? formatTime(time) : '—'} />
          <Row label="Service price" value={formatCurrency(servicePrice, currency)} />
          <Row label="Booking fee" value={formatCurrency(fee, currency)} />
        </dl>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="font-semibold">Total</span>
          <span className="font-heading text-2xl font-bold">{formatCurrency(servicePrice + fee, currency)}</span>
        </div>
        {error && (
          <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="mt-6 h-12 w-full text-base font-semibold" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {status === 'submitting'
            ? 'Reserving your slot…'
            : status === 'uploading'
              ? 'Uploading photos…'
              : status === 'redirecting'
                ? 'Opening secure payment…'
                : 'Continue to payment'}
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Secure card payment by Stripe. Your slot is held while you pay.
        </p>
      </aside>
    </form>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
