// API-level security + admin flow test with real JWTs (no service key involved).
// Admin mode requires a verified throwaway user temporarily set as app_config.admin_email
// (restore it afterwards). Usage:
//   node scripts/tests/api_security_test.mjs signup <email> <password>
//   node scripts/tests/api_security_test.mjs run <email> <password> <mode: user|admin>
import { createClient } from '@insforge/sdk'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
const [, , cmd, email, password, mode] = process.argv
const client = createClient({ baseUrl: env.NEXT_PUBLIC_INSFORGE_URL, anonKey: env.NEXT_PUBLIC_INSFORGE_ANON_KEY })
const out = (k, v) => console.log(`${mode ?? cmd}.${k} = ${typeof v === 'string' ? v : JSON.stringify(v)}`)

if (cmd === 'signup') {
  const { data, error } = await client.auth.signUp({ email, password })
  out('signup', error ? error.message : { verify: data?.requireEmailVerification, user: !!data?.user })
  process.exit(0)
}

const { data: session, error: signErr } = await client.auth.signInWithPassword({ email, password })
if (signErr || !session) {
  out('signin', signErr?.message ?? 'no session')
  process.exit(1)
}
out('signin', 'ok')
const db = client.database
const rpc = async (fn, args = {}) => {
  const { data, error } = await db.rpc(fn, args)
  return error ? `ERR ${error.message}` : data
}
const summarize = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? `array(${v.length})` : v && typeof v === 'object' ? `keys:${Object.keys(v).join(',')}` : String(v))

const PAID = 'd2286ba6-edca-4790-a9b9-f0464b5e4853' // FX-10505
const UNPAID = '1ccd6acc-e978-41d5-b60e-8de3c9050fb8' // FX-10509

out('is_admin', await rpc('is_admin'))
out('bookings_visible', (await db.from('bookings').select('id')).data?.length ?? 'err')
out('payments_visible', (await db.from('payments').select('id')).data?.length ?? 'err')
out('email_logs_visible', (await db.from('email_logs').select('id')).data?.length ?? 'err')
out('technicians_visible', (await db.from('technicians').select('id')).data?.length ?? 'err')
out('dashboard_stats', summarize(await rpc('admin_dashboard_stats', { p_days: 30 })))
out('booking_detail', summarize(await rpc('admin_booking_detail', { p_booking_id: PAID })))
{
  const { data, error } = await db.from('services').update({ active_status: true }).eq('slug', 'plumbing').select('id')
  out('update_service', error ? `ERR ${error.message}` : `rows ${data?.length}`)
}
{
  const { data, error } = await db.from('app_config').update({ admin_email: email }).neq('admin_email', '').select('*')
  out('self_promote_app_config', error ? `ERR ${error.message}` : `rows ${data?.length}`)
}
{
  const { error } = await db.from('bookings').update({ booking_status: 'completed' }).eq('id', PAID)
  out('direct_booking_update', error ? `ERR ${error.message}` : 'ALLOWED')
}
{
  const { data, error } = await db.from('profiles').update({ role: 'admin' }).neq('id', '00000000-0000-0000-0000-000000000000').select('id')
  out('profile_role_update', error ? `ERR ${error.message}` : `rows ${data?.length}`)
}

if (mode === 'admin') {
  const stats = await rpc('admin_dashboard_stats', { p_days: 30 })
  out('stats.revenue_total', stats.revenue_total)
  out('stats.monthly_points', stats.monthly_revenue?.length)
  const cust = await rpc('admin_list_customers', { p_search: null, p_limit: 5, p_offset: 0 })
  out('customers.total', cust.total)
  const d = await rpc('admin_booking_detail', { p_booking_id: PAID })
  out('detail.token_fields_leaked', 'lookup_token_hash' in d.booking || 'lookup_token_cipher' in d.booking)
  out('detail.eligible', d.eligible_technicians?.map((t) => `${t.full_name}:${t.has_skill}/${t.conflict}`))

  // create technician with skill
  const svc = d.booking.service_id
  const { data: tech, error: tErr } = await db.from('technicians').insert([{ full_name: 'QA Tech', phone: '+10000001', availability_status: 'available', active_status: true }]).select('id')
  out('tech.create', tErr ? `ERR ${tErr.message}` : 'ok')
  const techId = tech?.[0]?.id
  const { error: sErr } = await db.from('technician_skills').insert([{ technician_id: techId, service_id: svc }])
  out('tech.skill', sErr ? `ERR ${sErr.message}` : 'ok')
  const { error: delErr } = await db.from('technicians').delete().eq('id', techId)
  out('tech.delete', delErr ? `ERR ${delErr.message}` : 'ALLOWED')

  out('confirm_unpaid', await rpc('set_booking_status', { p_booking_id: UNPAID, p_new_status: 'confirmed', p_notes: null }))
  out('start_without_tech', await rpc('set_booking_status', { p_booking_id: PAID, p_new_status: 'in_progress', p_notes: null }))
  out('assign', summarize(await rpc('assign_technician', { p_booking_id: PAID, p_technician_id: techId, p_notes: 'qa' })))
  out('assign_again', summarize(await rpc('assign_technician', { p_booking_id: PAID, p_technician_id: techId, p_notes: 'qa' })))
  out('note', summarize(await rpc('add_booking_note', { p_booking_id: PAID, p_note: 'qa note' })))
  const dt = new Date(Date.now() + 4 * 864e5)
  if (dt.getDay() === 0) dt.setDate(dt.getDate() + 1)
  const date = dt.toISOString().slice(0, 10)
  out('reschedule', summarize(await rpc('reschedule_booking', { p_booking_id: PAID, p_date: date, p_time: '11:00', p_notes: 'qa reschedule' })))
  out('in_progress', summarize(await rpc('set_booking_status', { p_booking_id: PAID, p_new_status: 'in_progress', p_notes: null })))
  out('completed', summarize(await rpc('set_booking_status', { p_booking_id: PAID, p_new_status: 'completed', p_notes: 'done' })))
  out('cancel_completed', await rpc('set_booking_status', { p_booking_id: PAID, p_new_status: 'cancelled', p_notes: null }))
  const after = await rpc('admin_booking_detail', { p_booking_id: PAID })
  out('after.status', `${after.booking.booking_status} ${after.booking.appointment_date} ${after.booking.appointment_start_time} tech=${after.technician?.full_name}`)
  out('after.history', after.history.map((h) => h.action))
  out('after.emails', after.emails.map((e) => `${e.email_type}:${e.delivery_status}`))
  out('after.assignments', after.assignments.map((a) => a.status))

  // settings + pricing
  {
    const { data, error } = await db.from('business_settings').update({ slot_capacity: 3 }).eq('id', true).select('slot_capacity')
    out('settings.update', error ? `ERR ${error.message}` : data)
  }
  {
    const { error } = await db.from('business_settings').update({ currency: 'EUR' }).eq('id', true)
    out('settings.currency', error ? `ERR ${error.message}` : 'ALLOWED')
  }
  out('pricing.above_task', await rpc('admin_update_service_pricing', { p_service_id: svc, p_starting_price: 99999, p_booking_fee: null }))
  {
    const { error } = await db.from('services').delete().eq('id', svc)
    out('service.delete', error ? `ERR ${error.message}` : 'ALLOWED')
  }
  {
    const { error } = await db.from('reviews').update({ visibility_status: 'hidden' }).eq('booking_id', PAID)
    out('review.moderate', error ? `ERR ${error.message}` : 'ok')
  }
  {
    const { error } = await db.from('contact_messages').update({ status: 'new' }).eq('status', 'new')
    out('message.update', error ? `ERR ${error.message}` : 'ok')
  }
  const { data: signed, error: signedErr } = await client.storage.from('booking-attachments').createSignedUrls(['nonexistent/x.jpg'], 60)
  out('storage.signed', signedErr ? `ERR ${signedErr.message}` : signed)
  console.log('TECH_ID=' + techId)
}
