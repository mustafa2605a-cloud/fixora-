// Static marketing content and shared types. Live catalogue data (services,
// tasks, prices, ratings) comes from InsForge via lib/catalog.ts.

export type ServiceIcon = 'wrench' | 'zap' | 'snowflake' | 'sparkles' | 'hammer' | 'paintbrush'

export type ServiceTask = { id: string; name: string; price: number; description?: string | null; duration?: string | null }

export type ServiceCategory = {
  id: string
  slug: string
  name: string
  short: string
  description: string
  image: string
  startingPrice: number
  bookingFee: number
  duration: string
  rating: number | null
  reviewCount: number
  jobsDone: number
  icon: ServiceIcon
  includes: string[]
  tasks: ServiceTask[]
}

export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'technician_assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'payment_failed'

export const bookingStatusLabel: Record<BookingStatus, string> = {
  pending_payment: 'Pending Payment',
  confirmed: 'Confirmed',
  technician_assigned: 'Technician Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  payment_failed: 'Payment Failed',
}

// Badge colours for customer-facing booking status pills.
export const bookingStatusTone: Record<BookingStatus, string> = {
  pending_payment: 'bg-muted text-muted-foreground',
  confirmed: 'bg-accent text-accent-foreground',
  technician_assigned: 'bg-accent text-accent-foreground',
  in_progress: 'bg-chart-4/15 text-chart-4',
  completed: 'bg-chart-3/15 text-chart-3',
  cancelled: 'bg-destructive/10 text-destructive',
  rejected: 'bg-destructive/10 text-destructive',
  payment_failed: 'bg-destructive/10 text-destructive',
}

export const paymentStatusLabel: Record<string, string> = {
  unpaid: 'Unpaid',
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
  cancelled: 'Cancelled',
  succeeded: 'Succeeded',
}

export type TechnicianAvailability = 'available' | 'on_job' | 'off_duty' | 'unavailable'

export const technicianAvailabilityLabel: Record<TechnicianAvailability, string> = {
  available: 'Available',
  on_job: 'On Job',
  off_duty: 'Off Duty',
  unavailable: 'Unavailable',
}

export const testimonials = [
  { name: 'Sara A.', role: 'Homeowner', quote: 'Booked a plumber at 9am and the leak was fixed before lunch. Clear pricing, zero hassle.', rating: 5 },
  { name: 'James C.', role: 'Landlord', quote: 'I manage four flats and Fixora is now the only app I use for repairs. The technicians are reliable.', rating: 5 },
  { name: 'Mariam Y.', role: 'Busy parent', quote: 'The deep clean was incredible. Being able to pick an exact time slot is a game changer.', rating: 5 },
]

export const faqs = [
  { q: 'How quickly can a technician arrive?', a: 'Most bookings are served the same day. You choose the exact slot that suits you during checkout.' },
  { q: 'Are your technicians verified?', a: 'Every professional is background-checked, skills-tested and insured before joining Fixora.' },
  { q: 'How does pricing work?', a: 'You see a transparent starting price before booking. Any additional parts are approved by you before work begins.' },
  { q: 'What if I am not happy with the job?', a: 'Every job is covered by our 30-day Fixora Guarantee. We will send someone back to make it right, free of charge.' },
]

export function formatCurrency(value: number | string, currency = 'USD') {
  const n = Number(value ?? 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ISO weekdays (Mon = 1 … Sun = 7), as stored in business_settings.working_days.
const isoDayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function describeOpeningHours(days: number[], start: string, end: string) {
  const sorted = [...days].sort((a, b) => a - b)
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  const dayText =
    sorted.length === 7
      ? '7 days'
      : contiguous && sorted.length > 2
        ? `${isoDayNames[sorted[0]]}–${isoDayNames[sorted.at(-1)!]}`
        : sorted.map((d) => isoDayNames[d]).join(', ')
  return `${dayText}, ${formatTime(start)} – ${formatTime(end)}`
}
