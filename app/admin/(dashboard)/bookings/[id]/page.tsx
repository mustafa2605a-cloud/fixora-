import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { EmptyState, PageHeader, StatusBadge } from '@/components/admin/admin-ui'
import { BookingActions } from '@/components/admin/booking-actions'
import { EmailRetryButton, ReviewModeration } from '@/components/admin/booking-misc'
import { formatCurrency, formatTime, type BookingStatus } from '@/lib/data'
import { serverClient } from '@/lib/insforge/server'

export const metadata = { title: 'Booking' }

type Detail = {
  booking: Record<string, any>
  technician: { id: string; full_name: string; phone: string } | null
  history: { id: string; previous_status: string | null; new_status: string; action: string; notes: string | null; created_at: string; performed_by: string | null }[]
  payments: Record<string, any>[]
  attachments: { id: string; storage_path: string; original_file_name: string; file_type: string; file_size: number; created_at: string }[]
  emails: { id: string; email_type: string; recipient_email: string; delivery_status: string; error_message: string | null; attempts: number; created_at: string; sent_at: string | null }[]
  assignments: { technician: string; status: string; assigned_at: string; notes: string | null }[]
  review: { id: string; rating: number; review_text: string | null; visibility_status: string } | null
  eligible_technicians: { id: string; full_name: string; availability_status: string; has_skill: boolean; conflict: boolean }[]
}

const actionLabel: Record<string, string> = {
  booking_created: 'Booking created',
  payment_verified: 'Payment verified',
  payment_failed: 'Payment failed',
  payment_cancelled: 'Checkout expired/cancelled',
  payment_expired: 'Payment window expired',
  payment_amount_mismatch: 'Payment amount mismatch',
  paid_slot_unavailable: 'Paid but slot unavailable',
  payment_after_cancellation: 'Paid after cancellation',
  duplicate_payment: 'Duplicate payment',
  refund_recorded: 'Refund recorded',
  technician_assigned: 'Technician assigned',
  technician_reassigned: 'Technician reassigned',
  technician_removed: 'Technician removed',
  rescheduled: 'Rescheduled',
  status_changed: 'Status changed',
  customer_cancelled: 'Cancelled by customer',
  note_added: 'Note added',
}

export default async function AdminBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const client = await serverClient()
  const { data, error } = await client.database.rpc('admin_booking_detail', { p_booking_id: id })
  if (error?.message?.includes('booking_not_found')) notFound()
  if (error || !data) return <EmptyState>Could not load booking: {error?.message}</EmptyState>
  const d = data as Detail
  const b = d.booking

  let signed: Record<string, string> = {}
  if (d.attachments.length) {
    const { data: urls } = await client.storage.from('booking-attachments').createSignedUrls(
      d.attachments.map((a) => a.storage_path),
      600,
    )
    signed = Object.fromEntries((urls ?? []).filter((u) => u.signedUrl).map((u) => [u.path, u.signedUrl as string]))
  }

  return (
    <>
      <Link href="/admin/bookings" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> All bookings
      </Link>
      <PageHeader title={b.booking_reference} description={`Created ${new Date(b.created_at).toLocaleString('en-US')}`}>
        <div className="flex gap-2">
          <StatusBadge status={b.booking_status} />
          <StatusBadge status={b.payment_status} />
        </div>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card title="Customer">
            <Grid
              items={[
                ['Name', b.guest_name],
                ['Email', b.guest_email],
                ['Phone', b.guest_phone],
                ['Account', b.customer_user_id ? 'Linked account' : 'Guest checkout'],
              ]}
            />
          </Card>
          <Card title="Job">
            <Grid
              items={[
                ['Service', b.service_name_snapshot],
                ['Task', b.task_name_snapshot],
                ['Date', b.appointment_date],
                ['Time', `${formatTime(b.appointment_start_time)} – ${formatTime(b.appointment_end_time)}`],
                ['Technician', d.technician ? `${d.technician.full_name} · ${d.technician.phone}` : 'Unassigned'],
                ['Address', [b.service_address, b.building_number, b.apartment_number && `Apt ${b.apartment_number}`, b.area, b.city].filter(Boolean).join(', ')],
                ['Directions', b.additional_directions],
                ['Problem', b.problem_description],
                ['Customer notes', b.customer_notes],
                ['Cancellation reason', b.cancellation_reason],
              ]}
            />
            {b.admin_notes && (
              <div className="mt-4 rounded-xl bg-muted p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Internal notes</p>
                <p className="mt-1 whitespace-pre-wrap">{b.admin_notes}</p>
              </div>
            )}
          </Card>

          <Card title={`Photos (${d.attachments.length})`}>
            {d.attachments.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {d.attachments.map((a) => (
                  <li key={a.id} className="overflow-hidden rounded-xl border border-border">
                    {signed[a.storage_path] ? (
                      <a href={signed[a.storage_path]} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={signed[a.storage_path]} alt={a.original_file_name} className="aspect-square w-full object-cover" />
                      </a>
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">Unavailable</div>
                    )}
                    <p className="truncate px-2 py-1 text-xs text-muted-foreground">{a.original_file_name}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No photos attached.</p>
            )}
          </Card>

          <Card title="Payments">
            <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-4">
              <Stat label="Service" value={formatCurrency(Number(b.service_price_snapshot) + Number(b.additional_task_price_snapshot), b.currency)} />
              <Stat label="Fee" value={formatCurrency(Number(b.booking_fee_snapshot), b.currency)} />
              <Stat label="Discount" value={formatCurrency(Number(b.discount_amount), b.currency)} />
              <Stat label="Total" value={formatCurrency(Number(b.total_amount), b.currency)} />
            </dl>
            {d.payments.length ? (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-mono text-xs">{p.provider_transaction_id ?? p.checkout_session_id ?? p.id}</span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={p.payment_status} />
                      {formatCurrency(Number(p.amount), p.currency)}
                      {Number(p.refunded_amount) > 0 && <span className="text-xs text-muted-foreground">refunded {formatCurrency(Number(p.refunded_amount), p.currency)}</span>}
                      {p.transaction_metadata?.amount_mismatch && <span className="text-xs text-destructive">amount mismatch</span>}
                      {p.transaction_metadata?.duplicate_payment && <span className="text-xs text-destructive">duplicate</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No payment attempts yet.</p>
            )}
            {b.payment_status === 'paid' && ['cancelled', 'rejected', 'payment_failed'].includes(b.booking_status) && (
              <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                This booking is closed but was paid. Issue the refund from the Stripe dashboard — the refund webhook will update this booking automatically.
              </p>
            )}
          </Card>

          {d.review && (
            <Card title="Review">
              <ReviewModeration review={d.review} bookingId={id} />
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <BookingActions
            bookingId={id}
            status={b.booking_status as BookingStatus}
            paymentStatus={b.payment_status}
            technicianId={d.technician?.id ?? null}
            technicians={d.eligible_technicians}
            appointmentDate={b.appointment_date}
          />

          <Card title="History">
            <ol className="flex flex-col gap-3 text-sm">
              {d.history.map((h) => (
                <li key={h.id} className="border-l-2 border-border pl-3">
                  <p className="font-medium">
                    {actionLabel[h.action] ?? h.action}
                    {h.previous_status !== h.new_status && h.previous_status && (
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        · {h.previous_status} → {h.new_status}
                      </span>
                    )}
                  </p>
                  {h.notes && <p className="text-muted-foreground">{h.notes}</p>}
                  <p className="text-xs text-muted-foreground">
                    {new Date(h.created_at).toLocaleString('en-US')} · {h.performed_by ?? 'System'}
                  </p>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Emails">
            {d.emails.length ? (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {d.emails.map((e) => (
                  <li key={e.id} className="flex flex-col gap-1 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span>{e.email_type.replace(/_/g, ' ')}</span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={e.delivery_status} />
                        {(e.delivery_status === 'failed' || e.delivery_status === 'skipped') && <EmailRetryButton id={e.id} bookingId={id} />}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {e.recipient_email} · {e.attempts} attempt{e.attempts === 1 ? '' : 's'}
                    </p>
                    {e.error_message && <p className="text-xs text-destructive">{e.error_message}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No emails yet.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-4 font-heading font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Grid({ items }: { items: [string, string | null | undefined][] }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {items
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className={k === 'Problem' || k === 'Address' ? 'sm:col-span-2' : undefined}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="whitespace-pre-wrap font-medium">{v}</dd>
          </div>
        ))}
    </dl>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}
