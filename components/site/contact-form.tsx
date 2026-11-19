'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { publicClient } from '@/lib/insforge/public'

const fieldClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function ContactForm() {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    const { error: rpcError } = await publicClient().database.rpc('submit_contact_message', {
      p_name: String(data.get('name') ?? ''),
      p_email: String(data.get('email') ?? ''),
      p_message: String(data.get('message') ?? ''),
    })
    setBusy(false)
    if (rpcError) {
      const m = rpcError.message ?? ''
      setError(
        m.includes('invalid_email')
          ? 'Please enter a valid email address.'
          : m.includes('invalid_message')
            ? 'Please write a slightly longer message.'
            : m.includes('too_many')
              ? 'You have sent several messages recently. Please wait a little.'
              : 'Could not send your message. Please try again.',
      )
      return
    }
    setSent(true)
  }

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
      onSubmit={handleSubmit}
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
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 w-fit px-6 font-semibold" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Send message
      </Button>
    </form>
  )
}
