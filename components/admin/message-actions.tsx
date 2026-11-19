'use client'

import { useTransition } from 'react'
import { markMessage } from '@/app/admin/actions'

export function MessageActions({ id, email }: { id: string; email: string }) {
  const [pending, start] = useTransition()
  return (
    <div className="flex shrink-0 gap-2">
      <a href={`mailto:${email}`} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
        Reply
      </a>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => void (await markMessage(id, 'read')))}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        Mark read
      </button>
    </div>
  )
}
