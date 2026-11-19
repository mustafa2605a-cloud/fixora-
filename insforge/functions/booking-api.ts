// Fixora booking API — InsForge Edge Function (Deno)
//
// POST { action: 'create', booking: {...}, idempotencyKey }  -> create guest booking + Stripe Checkout
// POST { action: 'pay', reference, token }                    -> (re)open Checkout for an unpaid booking
//
// All prices, availability and statuses are decided by Postgres functions;
// this function never trusts amounts from the browser. Uses the project API
// key (server-side secret) only to call trusted RPCs and the Stripe catalog.
import { createAdminClient } from 'npm:@insforge/sdk'

const BASE_URL = Deno.env.get('INSFORGE_BASE_URL') ?? ''
const API_KEY = Deno.env.get('API_KEY') ?? ''
const STRIPE_ENV = (Deno.env.get('STRIPE_ENVIRONMENT') ?? 'test') === 'live' ? 'live' : 'test'
const TOKEN_ENC_KEY = Deno.env.get('TOKEN_ENC_KEY') ?? ''
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')

const admin = createAdminClient({ baseUrl: BASE_URL, apiKey: API_KEY })

function originAllowed(origin: string | null): string | null {
  if (!origin) return null
  for (const pattern of ALLOWED_ORIGINS) {
    if (pattern === origin) return origin
    if (pattern.includes('*')) {
      const re = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\/]/g, '\\$&')).join('[a-z0-9-]+') + '$')
      if (re.test(origin)) return origin
    }
  }
  return null
}

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': originAllowed(origin) ?? APP_URL ?? 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

// Postgres raises short machine codes; map them to customer-safe messages.
const MESSAGES: Record<string, string> = {
  invalid_name: 'Please enter your full name.',
  invalid_email: 'Please enter a valid email address.',
  invalid_phone: 'Please enter a valid phone number.',
  invalid_address: 'Please enter the full service address.',
  invalid_city_or_area: 'Please choose your city and area.',
  area_not_served: 'Sorry, we do not serve that area yet.',
  text_too_long: 'One of the text fields is too long.',
  invalid_service: 'That service is no longer available.',
  invalid_task: 'That task is no longer available for this service.',
  task_required: 'Please choose a task.',
  appointment_in_past: 'Please choose a future date.',
  appointment_too_far: 'That date is too far ahead.',
  business_closed_that_day: 'We are closed on that day. Please pick another date.',
  outside_business_hours: 'Please choose one of the available time slots.',
  slot_too_soon: 'That slot is too soon. Please choose a later time.',
  slot_blocked: 'That time slot is not available. Please choose another.',
  slot_unavailable: 'That time slot was just taken. Please choose another.',
  duplicate_submission: 'This booking was already submitted.',
  duplicate_booking: 'You already have a booking for this service at that time.',
  invalid_idempotency_key: 'Please refresh the page and try again.',
  invalid_lookup: 'Booking not found.',
  booking_not_found: 'Booking not found.',
  already_paid: 'This booking is already paid.',
  booking_not_payable: 'This booking can no longer be paid online.',
  payment_window_expired: 'The payment window for this booking has expired. Please book again.',
}

function dbError(error: unknown): { code: string; message: string } {
  const raw = String((error as { message?: string })?.message ?? error ?? '')
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k)) ?? 'server_error'
  return { code, message: MESSAGES[code] ?? 'Something went wrong. Please try again.' }
}

// ---------------------------------------------------------------- crypto ---
async function encryptToken(token: string): Promise<string | null> {
  if (!TOKEN_ENC_KEY) return null
  const raw = Uint8Array.from(atob(TOKEN_ENC_KEY), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv)
  out.set(ct, iv.length)
  return btoa(String.fromCharCode(...out))
}

// ---------------------------------------------------------------- stripe ---
async function stripeApi(path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}/api/payments/stripe/${STRIPE_ENV}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`stripe_api_error: ${data?.message ?? data?.error ?? res.status}`)
  return data
}

async function ensureProduct(productKey: string, name: string): Promise<string> {
  const { data } = await admin.database
    .from('stripe_catalog_cache')
    .select('product_id')
    .eq('environment', STRIPE_ENV)
    .eq('product_key', productKey)
    .limit(1)
  if (data && data.length) return data[0].product_id
  const created = await stripeApi('/catalog/products', {
    name: name.slice(0, 250),
    metadata: { fixora_key: productKey },
    idempotencyKey: `fixora-product-${STRIPE_ENV}-${productKey}`,
  })
  const productId = created?.product?.productId ?? created?.product?.id
  if (!productId) throw new Error('stripe_product_missing')
  await admin.database
    .from('stripe_catalog_cache')
    .insert([{ environment: STRIPE_ENV, product_key: productKey, product_id: productId }])
  return productId
}

async function ensurePrice(productKey: string, name: string, amount: number, currency: string): Promise<string> {
  const unit = Math.round(amount * 100)
  const cur = currency.toLowerCase()
  const { data } = await admin.database
    .from('stripe_catalog_cache')
    .select('price_id')
    .eq('environment', STRIPE_ENV)
    .eq('product_key', productKey)
    .eq('unit_amount', unit)
    .eq('currency', cur)
    .not('price_id', 'is', null)
    .limit(1)
  if (data && data.length) return data[0].price_id
  const productId = await ensureProduct(productKey, name)
  const created = await stripeApi('/catalog/prices', {
    productId,
    currency: cur,
    unitAmount: unit,
    idempotencyKey: `fixora-price-${STRIPE_ENV}-${productKey}-${unit}-${cur}`,
  })
  const priceId = created?.price?.priceId ?? created?.price?.id
  if (!priceId) throw new Error('stripe_price_missing')
  await admin.database.from('stripe_catalog_cache').insert([
    { environment: STRIPE_ENV, product_key: productKey, product_id: productId, unit_amount: unit, currency: cur, price_id: priceId },
  ])
  return priceId
}

type Prepared = {
  booking_id: string
  booking_reference: string
  service_name: string
  task_name: string | null
  service_amount: number
  booking_fee: number
  total_amount: number
  currency: string
  email: string
  service_id: string
  open_session: { checkout_session_id: string; url: string } | null
}

async function openCheckout(reference: string, token: string, siteUrl: string) {
  const { data: prep, error } = await admin.database.rpc('prepare_checkout', { p_reference: reference, p_token: token })
  if (error) throw error
  const p = prep as Prepared
  if (p.open_session?.url) return { url: p.open_session.url, sessionId: p.open_session.checkout_session_id }

  const lineName = p.task_name ? `${p.service_name} — ${p.task_name}` : p.service_name
  const lineItems: { priceId: string; quantity: number }[] = []
  const serviceAmount = Number(p.service_amount)
  const fee = Number(p.booking_fee)
  if (serviceAmount > 0) {
    lineItems.push({ priceId: await ensurePrice(`line:${lineName}`, lineName, serviceAmount, p.currency), quantity: 1 })
  }
  if (fee > 0) {
    lineItems.push({ priceId: await ensurePrice('booking-fee', 'Fixora booking fee', fee, p.currency), quantity: 1 })
  }
  if (!lineItems.length) throw new Error('nothing_to_charge')

  const ref = encodeURIComponent(p.booking_reference)
  const window = Math.floor(Date.now() / (20 * 60 * 1000))
  const { data, error: checkoutError } = await admin.payments.stripe.createCheckoutSession(STRIPE_ENV, {
    mode: 'payment',
    lineItems,
    successUrl: `${siteUrl}/booking/${ref}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${siteUrl}/booking/${ref}?checkout=cancelled`,
    customerEmail: p.email,
    subject: { type: 'booking', id: p.booking_id },
    metadata: { booking_id: p.booking_id, booking_reference: p.booking_reference },
    idempotencyKey: `fixora-checkout-${p.booking_id}-${window}`,
  })
  if (checkoutError || !data?.checkoutSession?.url) {
    throw new Error(`stripe_checkout_failed: ${checkoutError?.message ?? 'no url'}`)
  }
  const session = data.checkoutSession
  const sessionId = session.checkoutSessionId ?? session.id
  const cipher = await encryptToken(token)
  const { error: attachError } = await admin.database.rpc('attach_checkout_session', {
    p_booking_id: p.booking_id,
    p_provider: 'stripe',
    p_checkout_session_id: sessionId,
    p_checkout_url: session.url,
    p_amount: Number(p.total_amount),
    p_currency: p.currency,
    p_environment: STRIPE_ENV,
    p_lookup_token_cipher: cipher,
  })
  if (attachError) console.error('attach_checkout_session failed', attachError)
  return { url: session.url as string, sessionId }
}

function str(v: unknown, max = 500): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

export default async function (req: Request): Promise<Response> {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)

  const siteUrl = originAllowed(origin) ?? APP_URL
  if (!siteUrl) return json({ error: 'origin_not_allowed' }, 403, origin)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json', message: 'Invalid request.' }, 400, origin)
  }

  try {
    if (body.action === 'create') {
      const b = (body.booking ?? {}) as Record<string, unknown>
      const idempotencyKey = str(body.idempotencyKey, 100)
      const { data, error } = await admin.database.rpc('create_booking', {
        p_service_id: str(b.serviceId, 64),
        p_task_id: str(b.taskId, 64),
        p_full_name: str(b.fullName, 120),
        p_email: str(b.email, 254),
        p_phone: str(b.phone, 40),
        p_problem_description: str(b.description, 2000),
        p_service_address: str(b.address, 300),
        p_city: str(b.city, 80),
        p_area: str(b.area, 80),
        p_street: str(b.street, 200),
        p_building_number: str(b.building, 100),
        p_apartment_number: str(b.apartment, 50),
        p_postal_code: null,
        p_additional_directions: str(b.directions, 500),
        p_appointment_date: str(b.date, 10),
        p_appointment_start_time: str(b.time, 8),
        p_customer_notes: str(b.notes, 2000),
        p_idempotency_key: idempotencyKey,
      })
      if (error) {
        const e = dbError(error)
        return json({ error: e.code, message: e.message }, e.code === 'server_error' ? 500 : 400, origin)
      }
      const row = Array.isArray(data) ? data[0] : data
      const result: Record<string, unknown> = {
        reference: row.booking_reference,
        token: row.lookup_token,
        total: Number(row.total_amount),
        currency: row.currency,
        checkoutUrl: null,
      }
      try {
        const checkout = await openCheckout(row.booking_reference, row.lookup_token, siteUrl)
        result.checkoutUrl = checkout.url
      } catch (err) {
        console.error('checkout creation failed', err)
        result.paymentError = String((err as Error)?.message ?? err).includes('stripe')
          ? 'Online payment is temporarily unavailable. Your slot is held — you can retry payment from your booking page.'
          : 'Could not start payment. Please retry from your booking page.'
      }
      return json(result, 200, origin)
    }

    if (body.action === 'pay') {
      const reference = str(body.reference, 20)
      const token = str(body.token, 128)
      if (!reference || !token) return json({ error: 'invalid_lookup', message: MESSAGES.invalid_lookup }, 400, origin)
      try {
        const checkout = await openCheckout(reference, token, siteUrl)
        return json({ checkoutUrl: checkout.url }, 200, origin)
      } catch (err) {
        const e = dbError(err)
        if (e.code !== 'server_error') return json({ error: e.code, message: e.message }, 400, origin)
        console.error('pay failed', err)
        return json({ error: 'payment_unavailable', message: 'Online payment is temporarily unavailable. Please try again shortly.' }, 503, origin)
      }
    }

    return json({ error: 'unknown_action' }, 400, origin)
  } catch (err) {
    console.error('booking-api error', err)
    return json({ error: 'server_error', message: 'Something went wrong. Please try again.' }, 500, origin)
  }
}
