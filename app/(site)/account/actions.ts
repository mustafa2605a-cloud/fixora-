'use server'

import { revalidatePath } from 'next/cache'
import { serverClient } from '@/lib/insforge/server'

// Every action runs as the signed-in user; Postgres functions only ever touch
// the caller's own profile and addresses (auth.uid()).

export type AccountResult = { ok: boolean; message?: string }

const friendly: Record<string, string> = {
  not_authenticated: 'Your session has expired. Please sign in again.',
  invalid_name: 'Please enter your full name (2–120 characters).',
  invalid_phone: 'Please enter a valid phone number.',
  invalid_address: 'Please enter the street and building (at least 5 characters).',
  area_not_served: 'Please choose a city and area we serve.',
  text_too_long: 'One of the fields is too long.',
  too_many_addresses: 'You can save up to 10 addresses. Delete one first.',
  address_not_found: 'That address no longer exists.',
}

function fail(error: { message?: string } | null | undefined): AccountResult {
  const raw = error?.message ?? ''
  const key = Object.keys(friendly).find((k) => raw.includes(k))
  return { ok: false, message: key ? friendly[key] : 'Something went wrong. Please try again.' }
}

export async function updateProfile(_: AccountResult | null, f: FormData): Promise<AccountResult> {
  const client = await serverClient()
  const { error } = await client.database.rpc('update_my_profile', {
    p_full_name: String(f.get('full_name') ?? ''),
    p_phone: String(f.get('phone') ?? ''),
  })
  if (error) return fail(error)
  revalidatePath('/account')
  return { ok: true, message: 'Saved.' }
}

export type AddressInput = {
  id?: string | null
  label: string
  city: string
  area: string
  street: string
  building: string
  apartment: string
  directions: string
  makeDefault?: boolean
}

export async function saveAddress(input: AddressInput): Promise<AccountResult> {
  const client = await serverClient()
  const { error } = await client.database.rpc('save_my_address', {
    p_id: input.id || null,
    p_label: input.label,
    p_city: input.city,
    p_area: input.area,
    p_street: input.street,
    p_building: input.building,
    p_apartment: input.apartment,
    p_directions: input.directions,
    p_make_default: input.makeDefault === true,
  })
  if (error) return fail(error)
  revalidatePath('/account')
  return { ok: true }
}

export async function deleteAddress(id: string): Promise<AccountResult> {
  const client = await serverClient()
  const { error } = await client.database.rpc('delete_my_address', { p_id: id })
  if (error) return fail(error)
  revalidatePath('/account')
  return { ok: true }
}
