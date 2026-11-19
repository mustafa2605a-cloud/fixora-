import 'server-only'
import { unstable_cache } from 'next/cache'
import { publicClient } from '@/lib/insforge/public'
import type { ServiceCategory } from '@/lib/data'

export const CATALOG_TAG = 'catalog'

type RawService = Omit<ServiceCategory, 'startingPrice' | 'bookingFee' | 'rating' | 'reviewCount' | 'jobsDone'> & {
  startingPrice: number | string
  bookingFee: number | string
  rating: number | string | null
  reviewCount: number | string
  jobsDone: number | string
}

async function loadCatalog(): Promise<ServiceCategory[]> {
  const { data, error } = await publicClient().database.rpc('get_public_catalog')
  if (error) throw new Error(`Failed to load services: ${error.message}`)
  return ((data ?? []) as RawService[]).map((s) => ({
    ...s,
    image: s.image || '/placeholder.svg',
    startingPrice: Number(s.startingPrice),
    bookingFee: Number(s.bookingFee),
    rating: s.rating === null ? null : Number(s.rating),
    reviewCount: Number(s.reviewCount),
    jobsDone: Number(s.jobsDone),
    tasks: s.tasks.map((t) => ({ ...t, price: Number(t.price) })),
  }))
}

// Cached for 60s and invalidated immediately when the admin edits the catalogue.
export const getCatalog = unstable_cache(loadCatalog, ['public-catalog'], { revalidate: 60, tags: [CATALOG_TAG] })

export async function getServiceBySlug(slug: string) {
  const catalog = await getCatalog()
  return catalog.find((s) => s.slug === slug) ?? null
}

export type ServiceArea = { city: string; area_name: string }

export const getServiceAreas = unstable_cache(
  async (): Promise<ServiceArea[]> => {
    const { data, error } = await publicClient()
      .database.from('service_areas')
      .select('city, area_name')
      .eq('active_status', true)
      .order('city')
      .order('area_name')
    if (error) throw new Error(`Failed to load service areas: ${error.message}`)
    return (data ?? []) as ServiceArea[]
  },
  ['service-areas'],
  { revalidate: 300, tags: [CATALOG_TAG] },
)

export const getBookingSettings = unstable_cache(
  async () => {
    const { data } = await publicClient()
      .database.from('business_settings')
      .select('currency, default_booking_fee, max_advance_days, working_days, business_hours_start, business_hours_end, contact_email, contact_phone, cancellation_policy, timezone')
      .limit(1)
    return (data?.[0] ?? null) as null | {
      currency: string
      default_booking_fee: number
      max_advance_days: number
      working_days: number[]
      business_hours_start: string
      business_hours_end: string
      contact_email: string | null
      contact_phone: string | null
      cancellation_policy: string | null
      timezone: string
    }
  },
  ['business-settings'],
  { revalidate: 300, tags: [CATALOG_TAG] },
)
