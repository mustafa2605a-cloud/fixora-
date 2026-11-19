// Fixora email + housekeeping worker — InsForge Edge Function (Deno)
//
// Invoked by an InsForge schedule (every 2 minutes) with
//   Authorization: Bearer <CRON_SECRET>
// 1. Releases unpaid booking holds that have expired.
// 2. Drains the `email_logs` outbox: renders branded HTML and sends it via
//    InsForge Email. Each row is updated to sent / failed (with retries), so
//    a failed email never affects a booking.
import { createAdminClient } from 'npm:@insforge/sdk'

const BASE_URL = Deno.env.get('INSFORGE_BASE_URL') ?? ''
const API_KEY = Deno.env.get('API_KEY') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const TOKEN_ENC_KEY = Deno.env.get('TOKEN_ENC_KEY') ?? ''
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') ?? ''

const admin = createAdminClient({ baseUrl: BASE_URL, apiKey: API_KEY })

type Booking = {
  id: string
  booking_reference: string
  booking_status: string
  payment_status: string
  guest_name: string
  guest_email: string
  guest_phone: string
  service_name: string
  task_name: string | null
  problem_description: string | null
  service_address: string
  city: string
  area: string
  appointment_date: string
  appointment_start_time: string
  appointment_end_time: string
  service_price: number
  booking_fee: number
  discount_amount: number
  total_amount: number
  currency: string
  cancellation_reason: string | null
  lookup_token_cipher: string | null
  technician_name: string | null
  technician_phone: string | null
  payment: { amount: number; currency: string; method: string | null; transaction_id: string | null; paid_at: string | null; refunded_amount: number } | null
}

type Job = {
  id: string
  email_type: string
  recipient_email: string
  recipient_type: 'customer' | 'admin'
  subject: string
  payload: Record<string, string | null>
  attempts: number
  booking: Booking | null
}

// ---------------------------------------------------------------- helpers ---
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const money = (n: unknown, cur = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(Number(n ?? 0))

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ampm}`
}

async function decryptToken(cipher: string | null): Promise<string | null> {
  if (!cipher || !TOKEN_ENC_KEY) return null
  try {
    const raw = Uint8Array.from(atob(TOKEN_ENC_KEY), (c) => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
    const data = Uint8Array.from(atob(cipher), (c) => c.charCodeAt(0))
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, key, data.slice(12))
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- layout ---
const AMBER = '#F5A524'
const INK = '#1C1917'
const MUTED = '#78716C'
const LINE = '#E7E5E4'

function layout(opts: { preheader: string; title: string; intro: string; body: string; cta?: { label: string; href: string } }) {
  const cta = opts.cta
    ? `<tr><td style="padding:8px 32px 8px"><a href="${esc(opts.cta.href)}" style="display:inline-block;background:${AMBER};color:${INK};font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px">${esc(opts.cta.label)}</a></td></tr>`
    : ''
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#FAF9F7;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${INK}">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border:1px solid ${LINE};border-radius:18px;overflow:hidden">
<tr><td style="background:${INK};padding:20px 32px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="background:${AMBER};width:34px;height:34px;border-radius:9px;text-align:center;font-weight:800;color:${INK};font-size:18px">F</td>
    <td style="padding-left:10px;color:#ffffff;font-weight:700;font-size:20px;letter-spacing:-0.3px">Fixora</td>
  </tr></table>
</td></tr>
<tr><td style="padding:28px 32px 6px"><h1 style="margin:0;font-size:22px;line-height:1.3">${esc(opts.title)}</h1></td></tr>
<tr><td style="padding:6px 32px 16px;font-size:15px;line-height:1.6;color:#44403C">${opts.intro}</td></tr>
${opts.body ? `<tr><td style="padding:0 32px 16px">${opts.body}</td></tr>` : ''}
${cta}
<tr><td style="padding:24px 32px 28px;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid ${LINE}">
  Fixora — trusted home services, booked in minutes.${SUPPORT_EMAIL ? ` Questions? Reply or write to <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:${MUTED}">${esc(SUPPORT_EMAIL)}</a>.` : ''}<br>
  You received this email because of a booking made on Fixora.
</td></tr>
</table></td></tr></table></body></html>`
}

function rows(items: [string, string | null | undefined][]) {
  const r = items
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 0;color:${MUTED};font-size:13px;width:42%;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;font-size:14px;font-weight:600;vertical-align:top">${esc(v)}</td></tr>`,
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F7;border:1px solid ${LINE};border-radius:12px;padding:8px 16px">${r}</table>`
}

function bookingRows(b: Booking) {
  return rows([
    ['Reference', b.booking_reference],
    ['Service', b.task_name ? `${b.service_name} — ${b.task_name}` : b.service_name],
    ['Date', fmtDate(b.appointment_date)],
    ['Time', `${fmtTime(b.appointment_start_time)} – ${fmtTime(b.appointment_end_time)}`],
    ['Address', `${b.service_address}, ${b.area}, ${b.city}`],
    ['Technician', b.technician_name],
    ['Total', money(b.total_amount, b.currency)],
  ])
}

// --------------------------------------------------------------- templates ---
async function render(job: Job): Promise<{ subject: string; html: string } | null> {
  const b = job.booking
  const p = job.payload ?? {}
  const token = b ? await decryptToken(b.lookup_token_cipher) : null
  const manageUrl = b && APP_URL ? `${APP_URL}/booking/${encodeURIComponent(b.booking_reference)}${token ? `#${token}` : ''}` : APP_URL
  const adminUrl = b && APP_URL ? `${APP_URL}/admin/bookings/${b.id}` : `${APP_URL}/admin`
  const first = esc((b?.guest_name ?? '').split(' ')[0] || 'there')
  const subject = job.subject

  switch (job.email_type) {
    case 'booking_confirmed':
      return { subject, html: layout({
        preheader: `Your ${b!.service_name} visit is confirmed for ${fmtDate(b!.appointment_date)}.`,
        title: 'Your booking is confirmed',
        intro: `Hi ${first}, thanks for booking with Fixora. Your payment was received and your appointment is locked in. We will email you as soon as a technician is assigned.`,
        body: bookingRows(b!),
        cta: { label: 'View or manage booking', href: manageUrl },
      }) }
    case 'payment_receipt': {
      const pay = b!.payment
      return { subject, html: layout({
        preheader: `Receipt for ${b!.booking_reference}: ${money(pay?.amount ?? b!.total_amount, b!.currency)}`,
        title: 'Payment receipt',
        intro: `Hi ${first}, here is your receipt. Card details are handled securely by Stripe — Fixora never stores them.`,
        body: rows([
          ['Reference', b!.booking_reference],
          ['Service', b!.task_name ? `${b!.service_name} — ${b!.task_name}` : b!.service_name],
          ['Service price', money(b!.service_price, b!.currency)],
          ['Booking fee', money(b!.booking_fee, b!.currency)],
          ['Discount', Number(b!.discount_amount) > 0 ? `− ${money(b!.discount_amount, b!.currency)}` : null],
          ['Amount paid', money(pay?.amount ?? b!.total_amount, pay?.currency ?? b!.currency)],
          ['Payment method', pay?.method ? pay.method.toUpperCase() : 'Card'],
          ['Transaction', pay?.transaction_id ?? null],
          ['Paid on', pay?.paid_at ? new Date(pay.paid_at).toUTCString() : null],
        ]),
        cta: { label: 'View booking', href: manageUrl },
      }) }
    }
    case 'booking_cancelled':
      return { subject, html: layout({
        preheader: `Booking ${b!.booking_reference} was cancelled.`,
        title: 'Your booking was cancelled',
        intro: `Hi ${first}, booking <strong>${esc(b!.booking_reference)}</strong> has been cancelled.${b!.cancellation_reason ? ` Reason: ${esc(b!.cancellation_reason)}.` : ''} ${b!.payment_status === 'paid' ? 'Because you already paid, our team will process your refund and email you once it is issued.' : ''}`,
        body: bookingRows(b!),
        cta: APP_URL ? { label: 'Book again', href: `${APP_URL}/book` } : undefined,
      }) }
    case 'booking_rejected':
      return { subject, html: layout({
        preheader: `We could not take booking ${b!.booking_reference}.`,
        title: 'We could not take this booking',
        intro: `Hi ${first}, unfortunately we are unable to fulfil booking <strong>${esc(b!.booking_reference)}</strong>.${b!.cancellation_reason ? ` ${esc(b!.cancellation_reason)}.` : ''} ${b!.payment_status === 'paid' ? 'A full refund will be issued to your original payment method.' : ''}`,
        body: bookingRows(b!),
      }) }
    case 'booking_rescheduled':
      return { subject, html: layout({
        preheader: `New time: ${fmtDate(b!.appointment_date)} at ${fmtTime(b!.appointment_start_time)}.`,
        title: 'Your booking has a new time',
        intro: `Hi ${first}, your appointment has been rescheduled. ${p.notes ? esc(p.notes) + '.' : ''}`,
        body: bookingRows(b!),
        cta: { label: 'View booking', href: manageUrl },
      }) }
    case 'technician_assigned':
      return { subject, html: layout({
        preheader: `${b!.technician_name ?? 'A technician'} will handle your ${b!.service_name} visit.`,
        title: 'Your technician is assigned',
        intro: `Hi ${first}, <strong>${esc(b!.technician_name ?? 'a verified Fixora technician')}</strong> will arrive on ${esc(fmtDate(b!.appointment_date))} between ${esc(fmtTime(b!.appointment_start_time))} and ${esc(fmtTime(b!.appointment_end_time))}.`,
        body: bookingRows(b!),
        cta: { label: 'View booking', href: manageUrl },
      }) }
    case 'service_completed':
      return { subject, html: layout({
        preheader: `Your ${b!.service_name} job is complete.`,
        title: 'Job completed',
        intro: `Hi ${first}, your ${esc(b!.service_name.toLowerCase())} job has been marked complete. Every job is covered by the 30-day Fixora Guarantee — if anything is not right, just reply to this email.`,
        body: bookingRows(b!),
      }) }
    case 'review_request':
      return { subject, html: layout({
        preheader: 'Tell us how your Fixora visit went — it takes 30 seconds.',
        title: 'How did we do?',
        intro: `Hi ${first}, we would love your feedback on ${esc(b!.technician_name ?? 'your technician')}'s visit. Your rating helps other customers and helps us improve.`,
        body: '',
        cta: { label: 'Leave a review', href: `${manageUrl}${manageUrl.includes('#') ? '' : ''}` },
      }) }
    case 'refund_processed':
      return { subject, html: layout({
        preheader: `Refund for ${b!.booking_reference}.`,
        title: 'Refund processed',
        intro: `Hi ${first}, a refund of <strong>${esc(money(b!.payment?.refunded_amount ?? 0, b!.currency))}</strong> for booking ${esc(b!.booking_reference)} has been issued. Depending on your bank it can take 5–10 business days to appear.`,
        body: '',
        cta: { label: 'View booking', href: manageUrl },
      }) }
    case 'admin_new_booking':
      return { subject, html: layout({
        preheader: `${b!.guest_name} booked ${b!.service_name} for ${b!.appointment_date}.`,
        title: `New paid booking ${b!.booking_reference}`,
        intro: 'A new booking has been paid and confirmed. Assign a technician from the dashboard.',
        body: rows([
          ['Customer', b!.guest_name], ['Email', b!.guest_email], ['Phone', b!.guest_phone],
          ['Service', b!.task_name ? `${b!.service_name} — ${b!.task_name}` : b!.service_name],
          ['When', `${b!.appointment_date} ${fmtTime(b!.appointment_start_time)}`],
          ['Address', `${b!.service_address}, ${b!.area}, ${b!.city}`],
          ['Problem', b!.problem_description], ['Paid', money(b!.total_amount, b!.currency)],
        ]),
        cta: { label: 'Open in dashboard', href: adminUrl },
      }) }
    case 'admin_booking_cancelled':
      return { subject, html: layout({
        preheader: `${b!.booking_reference} cancelled by the customer.`,
        title: `Booking ${b!.booking_reference} cancelled`,
        intro: `The customer cancelled this booking.${b!.payment_status === 'paid' ? ' <strong>It was paid — issue a refund in Stripe.</strong>' : ''}`,
        body: bookingRows(b!),
        cta: { label: 'Open in dashboard', href: adminUrl },
      }) }
    case 'admin_payment_failed':
    case 'admin_booking_problem':
      return { subject, html: layout({
        preheader: p.message ?? 'Action needed',
        title: job.email_type === 'admin_payment_failed' ? 'Payment failed' : 'Action needed',
        intro: esc(p.message ?? 'A booking needs attention.'),
        body: b ? bookingRows(b) : '',
        cta: { label: 'Open dashboard', href: adminUrl },
      }) }
    case 'admin_contact_message':
      return { subject, html: layout({
        preheader: `Message from ${p.name}`,
        title: 'New contact message',
        intro: `<strong>${esc(p.name)}</strong> (${esc(p.email)}) wrote:`,
        body: `<div style="white-space:pre-wrap;background:#FAF9F7;border:1px solid ${LINE};border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6">${esc(p.message)}</div>`,
      }) }
    default:
      return null
  }
}

// ------------------------------------------------------------------ main ---
export default async function (req: Request): Promise<Response> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  const summary = { expired: 0, sent: 0, failed: 0, retried: 0, skipped: 0 }

  const { data: expired, error: expireError } = await admin.database.rpc('expire_stale_bookings')
  if (expireError) console.error('expire_stale_bookings failed', expireError)
  else summary.expired = Number(expired ?? 0)

  for (let round = 0; round < 3; round++) {
    const { data, error } = await admin.database.rpc('claim_email_batch', { p_limit: 10 })
    if (error) {
      console.error('claim_email_batch failed', error)
      break
    }
    const jobs = (data ?? []) as Job[]
    if (!jobs.length) break

    for (const job of jobs) {
      try {
        const rendered = await render(job)
        if (!rendered) {
          await admin.database.rpc('complete_email', { p_id: job.id, p_success: false, p_provider_message_id: null, p_error: 'no_template', p_retry: false })
          summary.skipped++
          continue
        }
        const { data: sent, error: sendError } = await admin.emails.send({
          to: job.recipient_email,
          subject: rendered.subject,
          html: rendered.html,
          from: 'Fixora',
          ...(SUPPORT_EMAIL ? { replyTo: SUPPORT_EMAIL } : {}),
        })
        if (sendError) throw new Error(sendError.message ?? 'send_failed')
        const messageId = (sent as { id?: string; messageId?: string } | null)?.messageId ?? (sent as { id?: string } | null)?.id ?? null
        await admin.database.rpc('complete_email', { p_id: job.id, p_success: true, p_provider_message_id: messageId, p_error: null, p_retry: false })
        summary.sent++
      } catch (err) {
        const message = String((err as Error)?.message ?? err)
        const retry = job.attempts < 3
        await admin.database.rpc('complete_email', { p_id: job.id, p_success: false, p_provider_message_id: null, p_error: message, p_retry: retry })
        if (retry) summary.retried++
        else summary.failed++
      }
    }
  }

  return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
