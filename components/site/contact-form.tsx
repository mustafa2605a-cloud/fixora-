'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

const fieldClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function ContactForm() {
  const [sent, setSent] = useState(false)

  if (sent) {
    return (
      <div role="status" className="rounded-2xl border border-border bg-card p-8">
        <h2 className="font-heading text-xl font-semibold">Thanks — message received</h2>
        <p className="mt-2 text-muted-foreground">Our support team replies within a few hours.</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setSent(true)
      }}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 md:p-8"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Name
          <input name="name" required autoComplete="name" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" className={fieldClass} />
        </label>
      </div>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Message
        <textarea name="message" rows={5} required className={fieldClass} />
      </label>
      <Button type="submit" size="lg" className="h-11 w-fit px-6 font-semibold">
        Send message
      </Button>
    </form>
  )
}
