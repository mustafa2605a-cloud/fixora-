import type { Metadata } from 'next'
import { Clock, Mail, Phone } from 'lucide-react'
import { ContactForm } from '@/components/site/contact-form'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the Fixora support team.',
}

const channels = [
  { icon: Mail, label: 'Email', value: 'support@fixora.app' },
  { icon: Phone, label: 'Phone', value: '+1 (555) 010-0100' },
  { icon: Clock, label: 'Hours', value: '7 days, 7am – 10pm' },
]

export default function ContactPage() {
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
                <p className="font-medium">{c.value}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <ContactForm />
    </section>
  )
}
