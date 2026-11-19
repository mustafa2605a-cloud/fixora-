'use client'

import { useState, useTransition } from 'react'
import { Star } from 'lucide-react'
import { moderateReview, retryEmail } from '@/app/admin/actions'
import { StatusBadge } from '@/components/admin/admin-ui'

export function EmailRetryButton({ id, bookingId }: { id: string; bookingId: string | null }) {
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      disabled={pending || done}
      onClick={() => start(async () => setDone((await retryEmail(id, bookingId)).ok))}
      className="rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
    >
      {done ? 'Queued' : 'Retry'}
    </button>
  )
}

export function ReviewModeration({
  review,
  bookingId,
}: {
  review: { id: string; rating: number; review_text: string | null; visibility_status: string }
  bookingId: string
}) {
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="flex gap-0.5" aria-label={`${review.rating} out of 5`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className={i < review.rating ? 'size-4 fill-primary text-primary' : 'size-4 text-muted-foreground'} aria-hidden="true" />
          ))}
        </span>
        <StatusBadge status={review.visibility_status === 'published' ? 'active' : 'inactive'} label={review.visibility_status} />
      </div>
      {review.review_text && <p className="text-muted-foreground">{review.review_text}</p>}
      <div className="flex gap-2">
        {review.visibility_status !== 'published' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => void (await moderateReview(review.id, 'published', bookingId)))}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Publish
          </button>
        )}
        {review.visibility_status !== 'hidden' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => void (await moderateReview(review.id, 'hidden', bookingId)))}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Hide
          </button>
        )}
      </div>
    </div>
  )
}
