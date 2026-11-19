'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveTechnician, type TechnicianInput } from '@/app/admin/actions'
import { technicianAvailabilityLabel } from '@/lib/data'

const field = 'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

type Service = { id: string; name: string; service_tasks: { id: string; name: string; active_status: boolean }[] }

export function TechnicianForm({ services, initial }: { services: Service[]; initial?: TechnicianInput }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [skills, setSkills] = useState<Set<string>>(
    new Set((initial?.skills ?? []).map((s) => `${s.service_id}:${s.task_id ?? '*'}`)),
  )

  function toggle(key: string) {
    const next = new Set(skills)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSkills(next)
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const input: TechnicianInput = {
      id: initial?.id,
      full_name: String(f.get('full_name') ?? ''),
      phone: String(f.get('phone') ?? ''),
      email: String(f.get('email') ?? ''),
      specialization: String(f.get('specialization') ?? ''),
      description: String(f.get('description') ?? ''),
      availability_status: String(f.get('availability_status') ?? 'available'),
      active_status: f.get('active_status') === 'on',
      skills: Array.from(skills).map((k) => {
        const [service_id, task] = k.split(':')
        return { service_id, task_id: task === '*' ? null : task }
      }),
    }
    start(async () => {
      const r = await saveTechnician(input)
      setMessage({ ok: r.ok, text: r.ok ? 'Saved.' : (r.message ?? 'Failed') })
      if (r.ok && !initial?.id && r.id) router.replace(`/admin/technicians/${r.id}`)
      else if (r.ok) router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Full name
          <input name="full_name" defaultValue={initial?.full_name} required maxLength={120} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Phone
          <input name="phone" type="tel" defaultValue={initial?.phone} required maxLength={40} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email <span className="font-normal text-muted-foreground">(optional)</span>
          <input name="email" type="email" defaultValue={initial?.email} maxLength={254} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Specialization
          <input name="specialization" defaultValue={initial?.specialization} maxLength={120} placeholder="e.g. Plumbing & water heaters" className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Availability
          <select name="availability_status" defaultValue={initial?.availability_status ?? 'available'} className={field}>
            {Object.entries(technicianAvailabilityLabel).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
          <input name="active_status" type="checkbox" defaultChecked={initial?.active_status ?? true} className="size-4 accent-[var(--primary)]" />
          Active (inactive technicians keep their history)
        </label>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Notes / bio
        <textarea name="description" defaultValue={initial?.description} rows={2} maxLength={1000} className={`${field} h-auto py-2`} />
      </label>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Skills</legend>
        {services.map((s) => (
          <div key={s.id} className="rounded-xl border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={skills.has(`${s.id}:*`)} onChange={() => toggle(`${s.id}:*`)} className="size-4" />
              {s.name} — all tasks
            </label>
            {!skills.has(`${s.id}:*`) && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-6">
                {s.service_tasks.filter((t) => t.active_status).map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={skills.has(`${s.id}:${t.id}`)} onChange={() => toggle(`${s.id}:${t.id}`)} className="size-3.5" />
                    {t.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </fieldset>
      {message && <p className={message.ok ? 'text-sm text-chart-3' : 'text-sm text-destructive'}>{message.text}</p>}
      <Button type="submit" size="lg" className="h-11 w-fit px-6 font-semibold" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {initial?.id ? 'Save changes' : 'Create technician'}
      </Button>
    </form>
  )
}
