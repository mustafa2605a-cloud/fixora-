'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { serverClient } from '@/lib/insforge/server'
import { CATALOG_TAG } from '@/lib/catalog'

export type ActionResult = { ok: boolean; message?: string }

const friendly: Record<string, string> = {
  not_authorized: 'You are not authorized to do that.',
  invalid_status_transition: 'That status change is not allowed from the current status.',
  cannot_confirm_unpaid_booking: 'Only paid bookings can be confirmed.',
  assign_technician_first: 'Assign a technician before starting the job.',
  use_assign_technician: 'Use “Assign technician” to set this status.',
  status_unchanged: 'The booking already has that status.',
  booking_not_assignable: 'Only confirmed bookings can be assigned.',
  technician_inactive: 'That technician is inactive.',
  technician_unavailable: 'That technician is marked unavailable.',
  technician_lacks_skill: 'That technician does not have the required skill.',
  technician_already_assigned: 'That technician is already assigned.',
  technician_already_booked_that_slot: 'That technician already has a job at this time.',
  technician_busy_at_new_time: 'The assigned technician is busy at the new time.',
  no_technician_assigned: 'No technician is assigned.',
  cannot_unassign_now: 'You cannot unassign a technician from an active or completed job.',
  booking_not_reschedulable: 'This booking can no longer be rescheduled.',
  same_time: 'Pick a different date or time.',
  slot_unavailable: 'That slot is full.',
  slot_unavailable_reschedule_first: 'The original slot is now full — reschedule first.',
  slot_blocked: 'That slot is blocked.',
  appointment_in_past: 'That date is in the past.',
  business_closed_that_day: 'The business is closed on that day.',
  outside_business_hours: 'Choose a valid slot within business hours.',
  slot_too_soon: 'That slot is too soon.',
  appointment_too_far: 'That date is beyond the booking window.',
  invalid_note: 'Enter a note (max 2000 characters).',
  starting_price_above_task_price: 'The starting price cannot be higher than a task price.',
  service_tasks_additional_price_check: 'The starting price cannot be higher than a task price.',
  invalid_price: 'Enter a valid price.',
}

function fail(error: { message?: string } | null | undefined): ActionResult {
  const raw = error?.message ?? ''
  const key = Object.keys(friendly).find((k) => raw.includes(k))
  return { ok: false, message: key ? friendly[key] : raw || 'Something went wrong.' }
}

async function rpc(fn: string, args: Record<string, unknown>, paths: string[]): Promise<ActionResult> {
  const client = await serverClient()
  const { error } = await client.database.rpc(fn, args)
  if (error) return fail(error)
  paths.forEach((p) => revalidatePath(p))
  return { ok: true }
}

// ---------------------------------------------------------------- bookings ---
export async function setBookingStatus(bookingId: string, status: string, notes: string): Promise<ActionResult> {
  return rpc('set_booking_status', { p_booking_id: bookingId, p_new_status: status, p_notes: notes || null }, [
    `/admin/bookings/${bookingId}`,
    '/admin/bookings',
    '/admin',
  ])
}

export async function assignTechnician(bookingId: string, technicianId: string, notes: string): Promise<ActionResult> {
  return rpc('assign_technician', { p_booking_id: bookingId, p_technician_id: technicianId, p_notes: notes || null }, [
    `/admin/bookings/${bookingId}`,
    '/admin/bookings',
    '/admin/technicians',
  ])
}

export async function unassignTechnician(bookingId: string, notes: string): Promise<ActionResult> {
  return rpc('unassign_technician', { p_booking_id: bookingId, p_notes: notes || null }, [`/admin/bookings/${bookingId}`, '/admin/bookings'])
}

export async function rescheduleBooking(bookingId: string, date: string, time: string, notes: string): Promise<ActionResult> {
  return rpc('reschedule_booking', { p_booking_id: bookingId, p_date: date, p_time: time, p_notes: notes || null }, [
    `/admin/bookings/${bookingId}`,
    '/admin/bookings',
  ])
}

export async function addBookingNote(bookingId: string, note: string): Promise<ActionResult> {
  return rpc('add_booking_note', { p_booking_id: bookingId, p_note: note }, [`/admin/bookings/${bookingId}`])
}

export async function retryEmail(emailId: string, bookingId: string | null): Promise<ActionResult> {
  return rpc('admin_retry_email', { p_id: emailId }, bookingId ? [`/admin/bookings/${bookingId}`, '/admin/payments'] : ['/admin/payments'])
}

export async function getAvailabilityForAdmin(date: string) {
  const client = await serverClient()
  const { data } = await client.database.rpc('get_availability', { p_date: date })
  return (data ?? []) as { start_time: string; remaining: number; available: boolean; reason: string | null }[]
}

export async function moderateReview(reviewId: string, visibility: 'published' | 'hidden', bookingId: string): Promise<ActionResult> {
  const client = await serverClient()
  const { error } = await client.database.from('reviews').update({ visibility_status: visibility }).eq('id', reviewId)
  if (error) return fail(error)
  revalidatePath(`/admin/bookings/${bookingId}`)
  updateTag(CATALOG_TAG)
  return { ok: true }
}

// ------------------------------------------------------------- technicians ---
export type TechnicianInput = {
  id?: string
  full_name: string
  phone: string
  email: string
  specialization: string
  description: string
  availability_status: string
  active_status: boolean
  skills: { service_id: string; task_id: string | null }[]
}

export async function saveTechnician(input: TechnicianInput): Promise<ActionResult & { id?: string }> {
  const name = input.full_name.trim()
  const phone = input.phone.trim()
  if (name.length < 2) return { ok: false, message: 'Enter the technician’s name.' }
  if (phone.replace(/\D/g, '').length < 6) return { ok: false, message: 'Enter a valid phone number.' }
  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) return { ok: false, message: 'Enter a valid email or leave it empty.' }
  if (!['available', 'on_job', 'off_duty', 'unavailable'].includes(input.availability_status)) return { ok: false, message: 'Invalid availability.' }

  const client = await serverClient()
  const row = {
    full_name: name.slice(0, 120),
    phone: phone.slice(0, 40),
    email: input.email.trim() || null,
    specialization: input.specialization.trim().slice(0, 120) || null,
    description: input.description.trim().slice(0, 1000) || null,
    availability_status: input.availability_status,
    active_status: input.active_status,
  }
  let id = input.id
  if (id) {
    const { error } = await client.database.from('technicians').update(row).eq('id', id)
    if (error) return fail(error)
  } else {
    const { data, error } = await client.database.from('technicians').insert([row]).select('id')
    if (error || !data?.[0]) return fail(error)
    id = data[0].id as string
  }

  // Replace skills set.
  const { error: delError } = await client.database.from('technician_skills').delete().eq('technician_id', id)
  if (delError) return fail(delError)
  if (input.skills.length) {
    const { error: skillError } = await client.database
      .from('technician_skills')
      .insert(input.skills.map((s) => ({ technician_id: id, service_id: s.service_id, task_id: s.task_id })))
    if (skillError) return fail(skillError)
  }
  revalidatePath('/admin/technicians')
  revalidatePath(`/admin/technicians/${id}`)
  return { ok: true, id }
}

// ---------------------------------------------------------------- services ---
export type ServiceInput = {
  id?: string
  name: string
  slug?: string
  icon: string
  short_description: string
  description: string
  estimated_duration: string
  starting_price: number
  booking_fee: number | null
  active_status: boolean
  includes: string[]
}

const ICONS = ['wrench', 'zap', 'snowflake', 'sparkles', 'hammer', 'paintbrush']

export async function saveService(input: ServiceInput): Promise<ActionResult & { id?: string }> {
  if (input.name.trim().length < 2) return { ok: false, message: 'Enter a service name.' }
  if (!ICONS.includes(input.icon)) return { ok: false, message: 'Choose an icon.' }
  if (!Number.isFinite(input.starting_price) || input.starting_price < 0) return { ok: false, message: 'Enter a valid starting price.' }
  if (input.booking_fee !== null && (!Number.isFinite(input.booking_fee) || input.booking_fee < 0)) return { ok: false, message: 'Enter a valid booking fee.' }
  const client = await serverClient()
  const fields = {
    name: input.name.trim().slice(0, 80),
    icon: input.icon,
    short_description: input.short_description.trim().slice(0, 200) || null,
    description: input.description.trim().slice(0, 2000) || null,
    estimated_duration: input.estimated_duration.trim().slice(0, 40) || null,
    active_status: input.active_status,
    includes: input.includes.map((i) => i.trim()).filter(Boolean).slice(0, 12),
  }
  let id = input.id
  if (id) {
    // Price changes go through the RPC so existing task customer prices are preserved.
    const { error: priceError } = await client.database.rpc('admin_update_service_pricing', {
      p_service_id: id,
      p_starting_price: input.starting_price,
      p_booking_fee: input.booking_fee,
    })
    if (priceError) return fail(priceError)
    const { error } = await client.database.from('services').update(fields).eq('id', id)
    if (error) return fail(error)
  } else {
    const slug = (input.slug || input.name)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
    if (!slug) return { ok: false, message: 'Enter a valid slug.' }
    const { data: last } = await client.database.from('services').select('display_order').order('display_order', { ascending: false }).limit(1)
    const { data, error } = await client.database
      .from('services')
      .insert([{ ...fields, slug, starting_price: input.starting_price, booking_fee: input.booking_fee, display_order: Number(last?.[0]?.display_order ?? 0) + 1 }])
      .select('id')
    if (error?.message?.includes('services_slug_key') || error?.message?.includes('duplicate')) return { ok: false, message: 'A service with that slug already exists.' }
    if (error || !data?.[0]) return fail(error)
    id = data[0].id as string
  }
  revalidatePath('/admin/services')
  revalidatePath(`/admin/services/${id}`)
  updateTag(CATALOG_TAG)
  return { ok: true, id }
}

export type TaskInput = { id?: string; service_id: string; name: string; price: number; starting_price: number; active_status: boolean; duration_minutes: number | null }

export async function saveTask(input: TaskInput): Promise<ActionResult> {
  const name = input.name.trim()
  if (name.length < 2) return { ok: false, message: 'Enter a task name.' }
  if (!Number.isFinite(input.price) || input.price < input.starting_price) {
    return { ok: false, message: `Task price must be at least the starting price.` }
  }
  const client = await serverClient()
  const row = {
    name: name.slice(0, 120),
    additional_price: Math.round((input.price - input.starting_price) * 100) / 100,
    active_status: input.active_status,
    duration_minutes: input.duration_minutes,
  }
  const { error } = input.id
    ? await client.database.from('service_tasks').update(row).eq('id', input.id)
    : await client.database.from('service_tasks').insert([{ ...row, service_id: input.service_id }])
  if (error?.message?.includes('duplicate') || error?.message?.includes('service_tasks_service_id_name_key')) {
    return { ok: false, message: 'This service already has a task with that name.' }
  }
  if (error) return fail(error)
  revalidatePath(`/admin/services/${input.service_id}`)
  revalidatePath('/admin/services')
  updateTag(CATALOG_TAG)
  return { ok: true }
}

export async function markMessage(id: string, status: 'read' | 'archived'): Promise<ActionResult> {
  const client = await serverClient()
  const { error } = await client.database.from('contact_messages').update({ status }).eq('id', id)
  if (error) return fail(error)
  revalidatePath('/admin')
  return { ok: true }
}

// ---------------------------------------------------------------- settings ---
export type SettingsInput = {
  business_name: string
  contact_email: string
  contact_phone: string
  default_booking_fee: number
  business_hours_start: string
  business_hours_end: string
  working_days: number[]
  slot_capacity: number
  max_advance_days: number
  min_lead_hours: number
  payment_hold_minutes: number
  timezone: string
  cancellation_policy: string
  booking_rules: string
  notify_customer_email: boolean
  notify_admin_email: boolean
}

export async function saveSettings(input: SettingsInput): Promise<ActionResult> {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!time.test(input.business_hours_start) || !time.test(input.business_hours_end) || input.business_hours_end <= input.business_hours_start) {
    return { ok: false, message: 'Business hours must be a valid range.' }
  }
  if (input.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.contact_email)) return { ok: false, message: 'Enter a valid contact email.' }
  if (!input.working_days.length || input.working_days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return { ok: false, message: 'Select at least one working day.' }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: input.timezone })
  } catch {
    return { ok: false, message: 'Unknown timezone (use an IANA name like Asia/Karachi).' }
  }
  const ints: [number, number, number, string][] = [
    [input.slot_capacity, 1, 50, 'Slot capacity'],
    [input.max_advance_days, 1, 365, 'Booking window'],
    [input.min_lead_hours, 0, 72, 'Minimum lead time'],
    [input.payment_hold_minutes, 10, 180, 'Payment hold'],
  ]
  for (const [v, min, max, label] of ints) {
    if (!Number.isInteger(v) || v < min || v > max) return { ok: false, message: `${label} must be between ${min} and ${max}.` }
  }
  if (!Number.isFinite(input.default_booking_fee) || input.default_booking_fee < 0) return { ok: false, message: 'Enter a valid booking fee.' }

  const client = await serverClient()
  const { error } = await client.database
    .from('business_settings')
    .update({
      business_name: input.business_name.trim().slice(0, 80) || 'Fixora',
      contact_email: input.contact_email.trim() || null,
      contact_phone: input.contact_phone.trim().slice(0, 40) || null,
      default_booking_fee: input.default_booking_fee,
      business_hours_start: input.business_hours_start,
      business_hours_end: input.business_hours_end,
      working_days: [...new Set(input.working_days)].sort((a, b) => a - b),
      slot_capacity: input.slot_capacity,
      max_advance_days: input.max_advance_days,
      min_lead_hours: input.min_lead_hours,
      payment_hold_minutes: input.payment_hold_minutes,
      timezone: input.timezone,
      cancellation_policy: input.cancellation_policy.trim().slice(0, 2000) || null,
      booking_rules: input.booking_rules.trim().slice(0, 2000) || null,
      notify_customer_email: input.notify_customer_email,
      notify_admin_email: input.notify_admin_email,
    })
    .eq('id', true)
  if (error) return fail(error)
  revalidatePath('/admin/settings')
  updateTag(CATALOG_TAG)
  return { ok: true }
}

export async function saveServiceArea(input: { id?: string; city: string; area_name: string; active_status: boolean }): Promise<ActionResult> {
  const city = input.city.trim().slice(0, 80)
  const area = input.area_name.trim().slice(0, 80)
  if (city.length < 2 || area.length < 2) return { ok: false, message: 'Enter a city and area.' }
  const client = await serverClient()
  const row = { city, area_name: area, active_status: input.active_status }
  const { error } = input.id
    ? await client.database.from('service_areas').update(row).eq('id', input.id)
    : await client.database.from('service_areas').insert([row])
  if (error?.message?.includes('duplicate')) return { ok: false, message: 'That area already exists.' }
  if (error) return fail(error)
  revalidatePath('/admin/settings')
  updateTag(CATALOG_TAG)
  return { ok: true }
}
