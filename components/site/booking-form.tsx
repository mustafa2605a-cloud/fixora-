'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ServiceIcon } from '@/components/service-icon'
import { formatCurrency, services, timeSlots } from '@/lib/data'
import { cn } from '@/lib/utils'

const fieldClass =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

function nextDays(count: number) {
  const days: { value: string; weekday: string; day: string }[] = []
  const base = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    days.push({
      value: d.toISOString().slice(0, 10),
      weekday: i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }),
      day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    })
  }
  return days
}

export function BookingForm({ initialService }: { initialService?: string }) {
  const [serviceSlug, setServiceSlug] = useState(
    services.some((s) => s.slug === initialService) ? initialService! : services[0].slug,
  )
  const service = services.find((s) => s.slug === serviceSlug)!
  const [taskName, setTaskName] = useState(service.tasks[0].name)
  const days = useMemo(() => nextDays(7), [])
  const [date, setDate] = useState(days[0].value)
  const [time, setTime] = useState(timeSlots[1])
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const task = service.tasks.find((t) => t.name === taskName) ?? service.tasks[0]
  const fee = 5

  function selectService(slug: string) {
    setServiceSlug(slug)
    setTaskName(services.find((s) => s.slug === slug)!.tasks[0].name)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const phone = String(data.get('phone') ?? '').trim()
    const address = String(data.get('address') ?? '').trim()
    if (name.length < 2 || phone.length < 6 || address.length < 5) {
      setError('Please enter your name, a valid phone number and your full address.')
      return
    }
    setError(null)
    setConfirmation(`FX-${Math.floor(10000 + Math.random() * 89999)}`)
  }

  if (confirmation) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-3xl border border-border bg-card p-10 text-center" role="status">
        <CheckCircle2 className="size-14 text-primary" aria-hidden="true" />
        <h2 className="font-heading text-2xl font-bold">Booking confirmed</h2>
        <p className="text-muted-foreground">
          Your {service.name.toLowerCase()} visit ({task.name}) is booked for{' '}
          <span className="font-semibold text-foreground">
            {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {time}
          </span>
          .
        </p>
        <p className="rounded-lg bg-muted px-4 py-2 font-mono text-sm">Reference {confirmation}</p>
        <div className="flex gap-3 pt-2">
          <Link href="/" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            Back home
          </Link>
          <Button size="lg" onClick={() => setConfirmation(null)}>
            Book another
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-[1.6fr_1fr]" noValidate>
      <div className="flex flex-col gap-8">
        <fieldset className="flex flex-col gap-4">
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
          <label className="flex flex-col gap-2 text-sm font-medium">
            Task
            <select value={taskName} onChange={(e) => setTaskName(e.target.value)} className={fieldClass}>
              {service.tasks.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} — {formatCurrency(t.price)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <fieldset>
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
            {timeSlots.map((t) => (
              <button
                type="button"
                key={t}
                role="radio"
                aria-checked={t === time}
                onClick={() => setTime(t)}
                className={cn(
                  'rounded-lg border border-border bg-card py-2 text-sm font-medium',
                  t === time && 'border-primary bg-primary text-primary-foreground',
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-4 font-heading text-lg font-semibold">3. Your details</legend>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Full name
            <input name="name" autoComplete="name" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Phone
            <input name="phone" type="tel" autoComplete="tel" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
            Address
            <input name="address" autoComplete="street-address" required className={fieldClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium sm:col-span-2">
            Notes for the technician <span className="font-normal text-muted-foreground">(optional)</span>
            <textarea name="notes" rows={3} className={cn(fieldClass, 'h-auto py-2')} />
          </label>
        </fieldset>
      </div>

      <aside className="h-fit rounded-3xl border border-border bg-card p-6 lg:sticky lg:top-24">
        <h2 className="font-heading text-lg font-semibold">Summary</h2>
        <dl className="mt-4 flex flex-col gap-3 text-sm">
          <Row label="Service" value={service.name} />
          <Row label="Task" value={task.name} />
          <Row label="Date" value={new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
          <Row label="Arrival" value={time} />
          <Row label="Service price" value={formatCurrency(task.price)} />
          <Row label="Booking fee" value={formatCurrency(fee)} />
        </dl>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <span className="font-semibold">Total</span>
          <span className="font-heading text-2xl font-bold">{formatCurrency(task.price + fee)}</span>
        </div>
        {error && (
          <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="mt-6 h-12 w-full text-base font-semibold">
          Confirm booking
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">Pay after the job is done. Free cancellation.</p>
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
