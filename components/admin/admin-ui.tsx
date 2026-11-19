import type { LucideIcon } from 'lucide-react'
import { bookingStatusLabel, paymentStatusLabel, technicianAvailabilityLabel } from '@/lib/data'
import { cn } from '@/lib/utils'

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export function StatCard({ label, value, delta, icon: Icon }: { label: string; value: string; delta?: string; icon: LucideIcon }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="inline-flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="font-heading text-2xl font-bold">{value}</p>
      {delta && <p className="text-xs font-medium text-chart-3">{delta}</p>}
    </div>
  )
}

const statusStyles: Record<string, string> = {
  pending_payment: 'bg-muted text-muted-foreground',
  confirmed: 'bg-accent text-accent-foreground',
  technician_assigned: 'bg-accent text-accent-foreground',
  in_progress: 'bg-chart-4/15 text-chart-4',
  completed: 'bg-chart-3/15 text-chart-3',
  cancelled: 'bg-destructive/10 text-destructive',
  rejected: 'bg-destructive/10 text-destructive',
  payment_failed: 'bg-destructive/10 text-destructive',
  available: 'bg-chart-3/15 text-chart-3',
  on_job: 'bg-accent text-accent-foreground',
  off_duty: 'bg-muted text-muted-foreground',
  unavailable: 'bg-muted text-muted-foreground',
  paid: 'bg-chart-3/15 text-chart-3',
  succeeded: 'bg-chart-3/15 text-chart-3',
  unpaid: 'bg-muted text-muted-foreground',
  pending: 'bg-muted text-muted-foreground',
  failed: 'bg-destructive/10 text-destructive',
  refunded: 'bg-chart-4/15 text-chart-4',
  partially_refunded: 'bg-chart-4/15 text-chart-4',
  sent: 'bg-chart-3/15 text-chart-3',
  queued: 'bg-muted text-muted-foreground',
  sending: 'bg-muted text-muted-foreground',
  skipped: 'bg-muted text-muted-foreground',
  active: 'bg-chart-3/15 text-chart-3',
  inactive: 'bg-muted text-muted-foreground',
}

const labels: Record<string, string> = {
  ...bookingStatusLabel,
  ...technicianAvailabilityLabel,
  ...paymentStatusLabel,
  sent: 'Sent',
  queued: 'Queued',
  sending: 'Sending',
  skipped: 'Skipped',
  active: 'Active',
  inactive: 'Inactive',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', statusStyles[status] ?? 'bg-muted text-muted-foreground')}>
      {label ?? labels[status] ?? status}
    </span>
  )
}

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>
        {total === 0 ? 'No results' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <a href={hrefFor(page - 1)} className="rounded-md border border-border bg-card px-3 py-1.5 font-medium text-foreground hover:bg-muted">
            Previous
          </a>
        ) : null}
        {page < pages ? (
          <a href={hrefFor(page + 1)} className="rounded-md border border-border bg-card px-3 py-1.5 font-medium text-foreground hover:bg-muted">
            Next
          </a>
        ) : null}
      </div>
    </div>
  )
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">{children}</div>
}

export function TableCard({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl border border-border bg-card">{children}</div>
}

export const th = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground'
export const td = 'px-4 py-3 text-sm whitespace-nowrap'
