import type { LucideIcon } from 'lucide-react'
import type { BookingStatus, Technician } from '@/lib/data'
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

const statusStyles: Record<BookingStatus | Technician['status'], string> = {
  Pending: 'bg-muted text-muted-foreground',
  Confirmed: 'bg-accent text-accent-foreground',
  'In Progress': 'bg-chart-4/15 text-chart-4',
  Completed: 'bg-chart-3/15 text-chart-3',
  Cancelled: 'bg-destructive/10 text-destructive',
  Available: 'bg-chart-3/15 text-chart-3',
  'On Job': 'bg-accent text-accent-foreground',
  'Off Duty': 'bg-muted text-muted-foreground',
}

export function StatusBadge({ status }: { status: BookingStatus | Technician['status'] }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', statusStyles[status])}>
      {status}
    </span>
  )
}

export function TableCard({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl border border-border bg-card">{children}</div>
}

export const th = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground'
export const td = 'px-4 py-3 text-sm whitespace-nowrap'
