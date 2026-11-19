'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  addBookingNote,
  assignTechnician,
  getAvailabilityForAdmin,
  rescheduleBooking,
  setBookingStatus,
  unassignTechnician,
  type ActionResult,
} from '@/app/admin/actions'
import { bookingStatusLabel, formatTime, technicianAvailabilityLabel, type BookingStatus, type TechnicianAvailability } from '@/lib/data'

const field = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

// Mirrors public.assert_status_transition — the database is the authority.
const transitions: Record<BookingStatus, BookingStatus[]> = {
  pending_payment: ['cancelled', 'rejected', 'payment_failed'],
  payment_failed: ['cancelled', 'rejected', 'confirmed'],
  confirmed: ['in_progress', 'cancelled', 'rejected'],
  technician_assigned: ['in_progress', 'confirmed', 'cancelled'],
  in_progress: ['completed', 'cancelled', 'technician_assigned'],
  completed: [],
  cancelled: [],
  rejected: [],
}

type Tech = { id: string; full_name: string; availability_status: string; has_skill: boolean; conflict: boolean }

export function BookingActions({
  bookingId,
  status,
  paymentStatus,
  technicianId,
  technicians,
  appointmentDate,
}: {
  bookingId: string
  status: BookingStatus
  paymentStatus: string
  technicianId: string | null
  technicians: Tech[]
  appointmentDate: string
}) {
  const [pending, start] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)
  const options = transitions[status].filter((s) => s !== 'confirmed' || paymentStatus === 'paid')
  const [nextStatus, setNextStatus] = useState<string>(options[0] ?? '')
  const [statusNote, setStatusNote] = useState('')
  const [tech, setTech] = useState(technicians.find((t) => t.has_skill && !t.conflict && t.id !== technicianId)?.id ?? '')
  const [techNote, setTechNote] = useState('')
  const [date, setDate] = useState(appointmentDate)
  const [slots, setSlots] = useState<{ start_time: string; remaining: number; available: boolean }[]>([])
  const [time, setTime] = useState('')
  const [rescheduleNote, setRescheduleNote] = useState('')
  const [note, setNote] = useState('')
  const canAssign = ['confirmed', 'technician_assigned', 'in_progress'].includes(status)
  const canReschedule = !['completed', 'cancelled', 'rejected', 'in_progress'].includes(status)

  useEffect(() => {
    setNextStatus(options[0] ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (!canReschedule || !date) return
    getAvailabilityForAdmin(date).then((list) => {
      setSlots(list)
      setTime(list.find((s) => s.available)?.start_time.slice(0, 5) ?? '')
    })
  }, [date, canReschedule])

  function run(fn: () => Promise<ActionResult>, reset?: () => void) {
    setResult(null)
    start(async () => {
      const r = await fn()
      setResult(r.ok ? { ok: true, message: 'Saved.' } : r)
      if (r.ok) reset?.()
    })
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-semibold">Actions</h2>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />}
      </div>
      {result && (
        <p className={result.ok ? 'rounded-lg bg-chart-3/15 px-3 py-2 text-sm text-chart-3' : 'rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive'} role="status">
          {result.message}
        </p>
      )}

      {options.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Change status</p>
          <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} className={field} aria-label="New status">
            {options.map((s) => (
              <option key={s} value={s}>
                {bookingStatusLabel[s]}
              </option>
            ))}
          </select>
          <input value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Reason / note (shown in history)" className={field} maxLength={500} />
          <Button
            size="lg"
            variant={nextStatus === 'cancelled' || nextStatus === 'rejected' ? 'destructive' : 'default'}
            disabled={pending || !nextStatus}
            onClick={() => {
              if ((nextStatus === 'cancelled' || nextStatus === 'rejected') && !window.confirm(`Mark this booking as ${bookingStatusLabel[nextStatus as BookingStatus]}?`)) return
              run(() => setBookingStatus(bookingId, nextStatus, statusNote), () => setStatusNote(''))
            }}
          >
            Update to {bookingStatusLabel[nextStatus as BookingStatus] ?? '—'}
          </Button>
        </div>
      )}

      {canAssign && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{technicianId ? 'Reassign technician' : 'Assign technician'}</p>
          <select value={tech} onChange={(e) => setTech(e.target.value)} className={field} aria-label="Technician">
            <option value="">Select technician</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id} disabled={!t.has_skill || t.conflict || t.id === technicianId}>
                {t.full_name} — {technicianAvailabilityLabel[t.availability_status as TechnicianAvailability] ?? t.availability_status}
                {!t.has_skill ? ' · no skill' : ''}
                {t.conflict ? ' · busy at this time' : ''}
                {t.id === technicianId ? ' · current' : ''}
              </option>
            ))}
          </select>
          <input value={techNote} onChange={(e) => setTechNote(e.target.value)} placeholder="Note (optional)" className={field} maxLength={500} />
          <div className="flex gap-2">
            <Button size="lg" className="flex-1" disabled={pending || !tech} onClick={() => run(() => assignTechnician(bookingId, tech, techNote), () => setTechNote(''))}>
              {technicianId ? 'Reassign' : 'Assign'}
            </Button>
            {technicianId && status !== 'in_progress' && (
              <Button size="lg" variant="outline" disabled={pending} onClick={() => run(() => unassignTechnician(bookingId, techNote))}>
                Unassign
              </Button>
            )}
          </div>
        </div>
      )}

      {canReschedule && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reschedule</p>
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} aria-label="New date" />
            <select value={time} onChange={(e) => setTime(e.target.value)} className={field} aria-label="New time">
              {slots.length === 0 && <option value="">No slots</option>}
              {slots.map((s) => (
                <option key={s.start_time} value={s.start_time.slice(0, 5)} disabled={!s.available}>
                  {formatTime(s.start_time)} {s.available ? `(${s.remaining} left)` : '(unavailable)'}
                </option>
              ))}
            </select>
          </div>
          <input value={rescheduleNote} onChange={(e) => setRescheduleNote(e.target.value)} placeholder="Reason (sent to the customer)" className={field} maxLength={500} />
          <Button size="lg" variant="outline" disabled={pending || !time} onClick={() => run(() => rescheduleBooking(bookingId, date, time, rescheduleNote), () => setRescheduleNote(''))}>
            Reschedule
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Internal note</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} className={`${field} h-auto py-2`} placeholder="Visible to admins only" />
        <Button size="lg" variant="outline" disabled={pending || !note.trim()} onClick={() => run(() => addBookingNote(bookingId, note), () => setNote(''))}>
          Add note
        </Button>
      </div>
    </section>
  )
}
