'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Clock, Copy, Loader2, Star, XCircle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { bookingStatusLabel, formatCurrency, formatTime, paymentStatusLabel, type BookingStatus as Status } from '@/lib/data'
import { functionUrl } from '@/lib/insforge/config'
import { publicClient } from '@/lib/insforge/public'
import { recallBookingToken, rememberBookingToken } from '@/lib/booking-token'
import { cn } from '@/lib/utils'

type Booking = {
  booking_reference: string
  booking_status: Status
  payment_status: string
  service_name: string
  task_name: string | null
  problem_description: string | null
  appointment_date: string
  appointment_start_time: string
  appointment_end_time: string
  service_price: number
  booking_fee: number
  discount_amount: number
  total_amount: number
  currency: string
  contact_name: string
  contact_email: string
  contact_phone: string
  service_address: string
  city: string
  area: string
  technician: string | null
  payment_expires_at: string | null
  can_pay: boolean
  can_cancel: boolean
  can_review: boolean
  review: { rating: number; review_text: string | null } | null
  attachments: number
  cancellation_reason: string | null
  history: { status: Status; action: string; at: string }[]
}

const statusTone: Record<Status, string> = {
  pending_payment: 'bg-muted text-muted-foreground',
  confirmed: 'bg-accent text-accent-foreground',
  technician_assigned: 'bg-accent text-accent-foreground',
  in_progress: 'bg-chart-4/15 text-chart-4',
  completed: 'bg-chart-3/15 text-chart-3',
  cancelled: 'bg-destructive/10 text-destructive',
  rejected: 'bg-destructive/10 text-destructive',
  payment_failed: 'bg-destructive/10 text-destructive',
}

const actionLabel: Record<string, string> = {
  booking_created: 'Booking received',
  payment_verified: 'Payment confirmed',
  payment_failed: 'Payment failed',
  payment_cancelled: 'Payment not completed',
  payment_expired: 'Payment window expired',
  technician_assigned: 'Technician assigned',
  technician_reassigned: 'Technician changed',
  technician_removed: 'Technician unassigned',
  rescheduled: 'Rescheduled',
  status_changed: 'Status updated',
  customer_cancelled: 'Cancelled by you',
  refund_recorded: 'Refund issued',
}

export function BookingStatusView({ reference }: { reference: string }) {
  const params = useSearchParams()
  const checkout = params.get('checkout')
  const [token, setToken] = useState<string | null>(null)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'pay' | 'cancel' | 'review'>(null)
  const [polls, setPolls] = useState(0)
  const [copied, setCopied] = useState(false)
  const [rating, setRating] = useState(5)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const fromHash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
    const t = fromHash && fromHash.length >= 32 ? fromHash : recallBookingToken(reference)
    if (fromHash && fromHash.length >= 32) rememberBookingToken(reference, fromHash)
    if (!t) {
      setState('missing')
      return
    }
    setToken(t)
  }, [reference])

  const load = useCallback(async () => {
    if (!token) return null
    const { data, error } = await publicClient().database.rpc('lookup_booking', { p_reference: reference, p_token: token })
    if (error || !data) {
      setState(String(error?.message ?? '').includes('not_found') ? 'missing' : 'error')
      return null
    }
    setBooking(data as Booking)
    setState('ready')
    return data as Booking
  }, [reference, token])

  useEffect(() => {
    load()
  }, [load])

  // After Stripe redirects back, wait for the verified webhook to confirm.
  useEffect(() => {
    if (checkout !== 'success' || !booking) return
    if (booking.payment_status === 'paid' || polls >= 20) return
    pollTimer.current = setTimeout(async () => {
      await load()
      setPolls((n) => n + 1)
    }, 3000)
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [checkout, booking, polls, load])

  async function pay() {
    if (!token) return
    setBusy('pay')
    setMessage(null)
    try {
      const res = await fetch(functionUrl('booking-api'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pay', reference, token }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.checkoutUrl) {
        window.location.assign(body.checkoutUrl)
        return
      }
      setMessage(body.message ?? 'Payment is temporarily unavailable. Please try again shortly.')
      await load()
    } catch {
      setMessage('Network error. Please try again.')
    }
    setBusy(null)
  }

  async function cancel() {
    if (!token || !window.confirm('Cancel this booking?')) return
    setBusy('cancel')
    setMessage(null)
    const { error } = await publicClient().database.rpc('cancel_booking', {
      p_reference: reference,
      p_token: token,
      p_reason: 'Cancelled by customer',
    })
    if (error) setMessage(error.message.includes('passed') ? 'This appointment has already started.' : 'This booking can no longer be cancelled online. Please contact us.')
    await load()
    setBusy(null)
  }

  async function review(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!token) return
    setBusy('review')
    const text = String(new FormData(e.currentTarget).get('review') ?? '')
    const { error } = await publicClient().database.rpc('submit_review', {
      p_reference: reference,
      p_token: token,
      p_rating: rating,
      p_text: text,
    })
    setMessage(error ? 'Could not submit your review.' : 'Thanks for your feedback!')
    await load()
    setBusy(null)
  }

  async function copyLink() {
    if (!token) return
    await navigator.clipboard.writeText(`${window.location.origin}/booking/${reference}#${token}`).catch(() => null)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-3 text-muted-foreground" role="status">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" /> Loading your booking…
      </div>
    )
  }

  if (state === 'missing' || state === 'error' || !booking) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-3xl border border-border bg-card p-10 text-center">
        <AlertTriangle className="size-12 text-primary" aria-hidden="true" />
        <h2 className="font-heading text-2xl font-bold">{state === 'error' ? 'Something went wrong' : 'Booking link not recognised'}</h2>
        <p className="text-muted-foreground">
          {state === 'error'
            ? 'We could not load this booking right now. Please refresh in a moment.'
            : 'Open the private link from your confirmation email, or use the device you booked on. For help, contact us with your reference.'}
        </p>
        <p className="rounded-lg bg-muted px-4 py-2 font-mono text-sm">Reference {reference}</p>
        <Link href="/contact" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Contact support
        </Link>
      </div>
    )
  }

  const b = booking
  const paid = b.payment_status === 'paid'
  const waitingForWebhook = checkout === 'success' && !paid && b.booking_status === 'pending_payment'
  const dateLabel = new Date(`${b.appointment_date}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  let headline = { icon: Clock, title: 'Complete your payment', text: 'Your slot is held for a short time while you pay.' }
  if (waitingForWebhook) headline = { icon: Loader2, title: 'Confirming your payment…', text: 'This usually takes a few seconds. Please keep this page open.' }
  else if (b.booking_status === 'confirmed' || b.booking_status === 'technician_assigned' || b.booking_status === 'in_progress')
    headline = { icon: CheckCircle2, title: 'Booking confirmed', text: 'Payment received. We will notify you when your technician is on the way.' }
  else if (b.booking_status === 'completed') headline = { icon: CheckCircle2, title: 'Job completed', text: 'Thanks for choosing Fixora.' }
  else if (b.booking_status === 'cancelled' || b.booking_status === 'rejected')
    headline = { icon: XCircle, title: b.booking_status === 'cancelled' ? 'Booking cancelled' : 'Booking declined', text: b.cancellation_reason ?? '' }
  else if (b.booking_status === 'payment_failed')
    headline = { icon: XCircle, title: 'Payment not completed', text: 'This booking was not paid in time, so the slot was released. Please book again.' }
  else if (checkout === 'cancelled') headline = { icon: Clock, title: 'Payment cancelled', text: 'No charge was made. You can retry payment while your slot is held.' }
  else if (checkout === 'unavailable') headline = { icon: AlertTriangle, title: 'Booking received — payment pending', text: 'Online payment is temporarily unavailable. Your slot is held; please retry payment shortly.' }

  const Icon = headline.icon

  return (
    <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 md:p-8" role="status">
          <div className="flex items-start gap-4">
            <Icon className={cn('size-10 shrink-0 text-primary', waitingForWebhook && 'animate-spin')} aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-2xl font-bold">{headline.title}</h2>
              {headline.text && <p className="text-muted-foreground">{headline.text}</p>}
              {waitingForWebhook && polls >= 20 && (
                <p className="text-sm text-muted-foreground">Still processing. Refresh this page in a minute — you will not be charged twice.</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-muted px-3 py-1.5 font-mono text-sm">{b.booking_reference}</span>
            <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', statusTone[b.booking_status])}>
              {bookingStatusLabel[b.booking_status]}
            </span>
            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              Payment: {paymentStatusLabel[b.payment_status] ?? b.payment_status}
            </span>
          </div>
          {message && (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm" role="alert">
              {message}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {b.can_pay && !waitingForWebhook && (
              <Button size="lg" className="h-11 px-5 font-semibold" onClick={pay} disabled={busy !== null}>
                {busy === 'pay' && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Pay {formatCurrency(b.total_amount, b.currency)} securely
              </Button>
            )}
            {b.can_cancel && (
              <Button variant="outline" size="lg" className="h-11 px-5" onClick={cancel} disabled={busy !== null}>
                {busy === 'cancel' && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                Cancel booking
              </Button>
            )}
            {(b.booking_status === 'payment_failed' || b.booking_status === 'cancelled') && (
              <Link href="/book" className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-5 font-semibold')}>
                Book again
              </Link>
            )}
          </div>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6">
          <h3 className="font-heading font-semibold">Appointment</h3>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Item label="Service" value={b.task_name ? `${b.service_name} — ${b.task_name}` : b.service_name} />
            <Item label="When" value={`${dateLabel}, ${formatTime(b.appointment_start_time)}–${formatTime(b.appointment_end_time)}`} />
            <Item label="Address" value={`${b.service_address}, ${b.area}, ${b.city}`} />
            <Item label="Technician" value={b.technician ?? 'To be assigned'} />
            <Item label="Contact" value={`${b.contact_name} · ${b.contact_phone}`} />
            <Item label="Email" value={b.contact_email} />
            {b.problem_description && <Item label="Problem" value={b.problem_description} wide />}
            {b.attachments > 0 && <Item label="Photos" value={`${b.attachments} attached`} />}
          </dl>
        </section>

        {(b.can_review || b.review) && (
          <section className="rounded-3xl border border-border bg-card p-6">
            <h3 className="font-heading font-semibold">Your review</h3>
            {b.review ? (
              <p className="mt-3 text-sm text-muted-foreground">
                You rated this visit {b.review.rating}/5. {b.review.review_text}
              </p>
            ) : (
              <form onSubmit={review} className="mt-4 flex flex-col gap-3">
                <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)}>
                      <Star className={cn('size-7', n <= rating ? 'fill-primary text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                <textarea
                  name="review"
                  rows={3}
                  maxLength={2000}
                  placeholder="How did it go?"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <Button type="submit" size="lg" className="h-10 w-fit px-5 font-semibold" disabled={busy !== null}>
                  Submit review
                </Button>
              </form>
            )}
          </section>
        )}
      </div>

      <aside className="flex h-fit flex-col gap-6 lg:sticky lg:top-24">
        <div className="rounded-3xl border border-border bg-card p-6">
          <h3 className="font-heading text-lg font-semibold">Payment</h3>
          <dl className="mt-4 flex flex-col gap-3 text-sm">
            <Row label="Service price" value={formatCurrency(b.service_price, b.currency)} />
            <Row label="Booking fee" value={formatCurrency(b.booking_fee, b.currency)} />
            {Number(b.discount_amount) > 0 && <Row label="Discount" value={`− ${formatCurrency(b.discount_amount, b.currency)}`} />}
          </dl>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="font-semibold">Total</span>
            <span className="font-heading text-2xl font-bold">{formatCurrency(b.total_amount, b.currency)}</span>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-6">
          <h3 className="font-heading font-semibold">Timeline</h3>
          <ol className="mt-4 flex flex-col gap-3 text-sm">
            {b.history.map((h, i) => (
              <li key={i} className="flex justify-between gap-4">
                <span>{actionLabel[h.action] ?? bookingStatusLabel[h.status] ?? h.action}</span>
                <time className="shrink-0 text-muted-foreground" dateTime={h.at}>
                  {new Date(h.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </time>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-3xl border border-border bg-card p-6 text-sm">
          <p className="font-medium">Keep your private booking link</p>
          <p className="mt-1 text-muted-foreground">Anyone with this link can view and cancel the booking — do not share it.</p>
          <Button variant="outline" size="lg" className="mt-3 h-10 px-4" onClick={copyLink}>
            <Copy className="size-4" aria-hidden="true" />
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </div>
      </aside>
    </div>
  )
}

function Item({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-0.5', wide && 'sm:col-span-2')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
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
