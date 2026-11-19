import type { Metadata } from 'next'
import { Clock, Mail, Phone } from 'lucide-react'
import { ContactForm } from '@/components/site/contact-form'
import { getBookingSettings } from '@/lib/catalog'
import { formatTime } from '@/lib/data'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Fixora support team.',
}

export const revalidate = 300

// ISO weekdays (Mon = 1 … Sun = 7), as stored in business_settings.working_days.
const dayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function describeDays(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b)
  if (sorted.length === 7) return '7 days'
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  return contiguous && sorted.length > 2 ? `${dayNames[sorted[0]]}–${dayNames[sorted.at(-1)!]}` : sorted.map((d) => dayNames[d]).join(', ')
}

export default async function ContactPage() {
  const settings = await getBookingSettings().catch(() => null)
  const channels = [
    settings?.contact_email && { icon: Mail, label: 'Email', value: settings.contact_email, href: `mailto:${settings.contact_email}` },
    settings?.contact_phone && { icon: Phone, label: 'Phone', value: settings.contact_phone, href: `tel:${settings.contact_phone.replace(/[^+\d]/g, '')}` },
    settings && {
      icon: Clock,
      label: 'Hours',
      value: `${describeDays(settings.working_days)}, ${formatTime(settings.business_hours_start)} – ${formatTime(settings.business_hours_end)}`,
    },
  ].filter(Boolean) as { icon: typeof Mail; label: string; value: string; href?: string }[]
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1fr_1.4fr] md:px-6">
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-4xl font-bold tracking-tight">Contact us</h1>
        <p className="leading-relaxed text-muted-foreground">
          Questions about a booking, partnering as a technician, or anything else? We&apos;re here to help.
        </p>
        <ul className="flex flex-col gap-4">
          {channels.map((c) => (
            <li key={c.label} className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <c.icon className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{c.label}</p>
                {c.href ? (
                  <a href={c.href} className="font-medium hover:underline">
                    {c.value}
                  </a>
                ) : (
                  <p className="font-medium">{c.value}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <ContactForm />
    </section>
  )
}
