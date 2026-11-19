// Fixora booking photo upload — InsForge Edge Function (Deno)
//
// POST multipart/form-data: reference, token, file
// Guests have no account, so they cannot write to storage directly. This
// function verifies the booking reference + secret token, validates the file
// (type by magic bytes, max 5 MB, max 5 per booking), stores it in the
// PRIVATE `booking-attachments` bucket and records metadata.
import { createAdminClient } from 'npm:@insforge/sdk'

const BASE_URL = Deno.env.get('INSFORGE_BASE_URL') ?? ''
const API_KEY = Deno.env.get('API_KEY') ?? ''
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean)
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
const MAX_BYTES = 5 * 1024 * 1024

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

function respond(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Access-Control-Allow-Origin': originAllowed(origin) ?? APP_URL ?? 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      Vary: 'Origin',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function sniff(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: 'image/png', ext: 'png' }
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return { mime: 'image/webp', ext: 'webp' }
  return null
}

export default async function (req: Request): Promise<Response> {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return respond(null, 204, origin)
  if (req.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405, origin)
  if (!originAllowed(origin) && !APP_URL) return respond({ error: 'origin_not_allowed' }, 403, origin)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return respond({ error: 'invalid_form', message: 'Invalid upload.' }, 400, origin)
  }
  const reference = String(form.get('reference') ?? '').trim().toUpperCase()
  const token = String(form.get('token') ?? '').trim()
  const file = form.get('file')
  if (!reference || !token || !(file instanceof File)) {
    return respond({ error: 'invalid_form', message: 'Missing file or booking details.' }, 400, origin)
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return respond({ error: 'invalid_file_size', message: 'Each photo must be under 5 MB.' }, 400, origin)
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = sniff(bytes)
  if (!kind) {
    return respond({ error: 'unsupported_file_type', message: 'Only JPG, PNG or WebP photos are allowed.' }, 400, origin)
  }

  // Verify the booking first (raises booking_not_found on bad token).
  const { data: booking, error: lookupError } = await admin.database.rpc('lookup_booking', { p_reference: reference, p_token: token })
  if (lookupError || !booking) return respond({ error: 'booking_not_found', message: 'Booking not found.' }, 404, origin)
  if ((booking as { attachments: number }).attachments >= 5) {
    return respond({ error: 'too_many_attachments', message: 'You can attach up to 5 photos.' }, 400, origin)
  }

  const key = `bookings/${reference}/${crypto.randomUUID()}.${kind.ext}`
  const blob = new Blob([bytes], { type: kind.mime })
  const { data: uploaded, error: uploadError } = await admin.storage.from('booking-attachments').upload(key, blob)
  if (uploadError || !uploaded) {
    console.error('upload failed', uploadError)
    return respond({ error: 'upload_failed', message: 'Upload failed. Please try again.' }, 500, origin)
  }
  const storedKey = (uploaded as { key?: string }).key ?? key

  const { error: attachError } = await admin.database.rpc('attach_booking_file', {
    p_reference: reference,
    p_token: token,
    p_storage_path: storedKey,
    p_original_file_name: (file.name || `photo.${kind.ext}`).slice(0, 200),
    p_file_type: kind.mime,
    p_file_size: file.size,
  })
  if (attachError) {
    await admin.storage.from('booking-attachments').remove(storedKey).catch(() => {})
    const msg = String(attachError.message ?? '')
    return respond({ error: 'attach_failed', message: msg.includes('too_many') ? 'You can attach up to 5 photos.' : 'Could not attach photo.' }, 400, origin)
  }
  return respond({ ok: true }, 200, origin)
}
