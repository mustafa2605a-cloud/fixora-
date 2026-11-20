'use client'

import { useMemo, useState, useTransition } from 'react'
import { Loader2, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteAddress, saveAddress, type AddressInput } from '@/app/(site)/account/actions'
import { cn } from '@/lib/utils'

const fieldClass =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export type SavedAddress = {
  id: string
  label: string | null
  city: string
  area: string
  street: string | null
  building: string | null
  apartment: string | null
  directions: string | null
  is_default: boolean
}

type Area = { city: string; area_name: string }

export function AccountAddresses({ addresses, areas }: { addresses: SavedAddress[]; areas: Area[] }) {
  const [editing, setEditing] = useState<SavedAddress | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.ok) setError(res.message ?? 'Something went wrong.')
      else after?.()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {addresses.length === 0 && editing === null && (
        <p className="text-sm text-muted-foreground">No saved addresses yet. Addresses you book with are saved here automatically.</p>
      )}
      {addresses.map((a) =>
        editing !== 'new' && editing?.id === a.id ? (
          <AddressForm
            key={a.id}
            initial={a}
            areas={areas}
            pending={pending}
            onCancel={() => setEditing(null)}
            onSave={(input) => run(() => saveAddress(input), () => setEditing(null))}
          />
        ) : (
          <div key={a.id} className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {a.label || 'Address'}
                {a.is_default && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">Default</span>}
              </p>
              <p className="text-muted-foreground">
                {[a.apartment, a.street, a.building].filter(Boolean).join(', ')}
                <br />
                {a.area}, {a.city}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {!a.is_default && (
                <IconButton
                  label="Make default"
                  disabled={pending}
                  onClick={() => run(() => saveAddress({ ...toInput(a), makeDefault: true }))}
                >
                  <Star className="size-4" />
                </IconButton>
              )}
              <IconButton label="Edit" disabled={pending} onClick={() => setEditing(a)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton
                label="Delete"
                disabled={pending}
                onClick={() => window.confirm('Delete this address?') && run(() => deleteAddress(a.id))}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </div>
        ),
      )}
      {editing === 'new' ? (
        <AddressForm
          areas={areas}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(input) => run(() => saveAddress(input), () => setEditing(null))}
        />
      ) : (
        addresses.length < 10 && (
          <Button variant="outline" size="lg" className="h-10 w-fit px-4" onClick={() => setEditing('new')} disabled={pending}>
            <Plus className="size-4" aria-hidden="true" />
            Add address
          </Button>
        )
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function toInput(a: SavedAddress): AddressInput {
  return {
    id: a.id,
    label: a.label ?? '',
    city: a.city,
    area: a.area,
    street: a.street ?? '',
    building: a.building ?? '',
    apartment: a.apartment ?? '',
    directions: a.directions ?? '',
  }
}

function IconButton({ label, children, ...props }: { label: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      {...props}
    >
      {children}
    </button>
  )
}

function AddressForm({
  initial,
  areas,
  pending,
  onSave,
  onCancel,
}: {
  initial?: SavedAddress
  areas: Area[]
  pending: boolean
  onSave: (input: AddressInput) => void
  onCancel: () => void
}) {
  const cities = useMemo(() => Array.from(new Set(areas.map((a) => a.city))), [areas])
  const [city, setCity] = useState(initial?.city && cities.includes(initial.city) ? initial.city : (cities[0] ?? ''))
  const cityAreas = areas.filter((a) => a.city === city)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const get = (k: string) => String(f.get(k) ?? '').trim()
    onSave({
      id: initial?.id ?? null,
      label: get('label'),
      city,
      area: get('area'),
      street: get('street'),
      building: get('building'),
      apartment: get('apartment'),
      directions: get('directions'),
      makeDefault: f.get('make_default') === 'on',
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
          Label <span className="sr-only">(optional)</span>
          <input name="label" defaultValue={initial?.label ?? ''} placeholder="Home, Office…" maxLength={40} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          City
          <select value={city} onChange={(e) => setCity(e.target.value)} className={fieldClass}>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Area
          <select key={city} name="area" required defaultValue={initial?.city === city ? initial.area : ''} className={fieldClass}>
            <option value="" disabled>
              Select area
            </option>
            {cityAreas.map((a) => (
              <option key={a.area_name}>{a.area_name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
          Street &amp; building
          <input name="street" defaultValue={initial?.street ?? ''} required minLength={5} maxLength={300} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Apartment / villa no.
          <input name="apartment" defaultValue={initial?.apartment ?? ''} maxLength={50} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Building name
          <input name="building" defaultValue={initial?.building ?? ''} maxLength={100} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
          Directions
          <input name="directions" defaultValue={initial?.directions ?? ''} maxLength={500} placeholder="Landmarks, gate code, parking…" className={fieldClass} />
        </label>
      </div>
      {!initial?.is_default && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="make_default" className="size-4 accent-[var(--primary)]" />
          Use as my default address
        </label>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="lg" className={cn('h-10 px-5 font-semibold')} disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Save address
        </Button>
        <Button type="button" variant="ghost" size="lg" className="h-10 px-4" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
