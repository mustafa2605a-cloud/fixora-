'use client'

import { useActionState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateProfile, type AccountResult } from '@/app/(site)/account/actions'

const fieldClass =
  'h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function AccountProfileForm({ email, fullName, phone }: { email: string; fullName: string | null; phone: string | null }) {
  const [state, action, pending] = useActionState<AccountResult | null, FormData>(updateProfile, null)
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Full name
        <input name="full_name" defaultValue={fullName ?? ''} autoComplete="name" required maxLength={120} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Email
        <input value={email} readOnly disabled className={`${fieldClass} cursor-not-allowed bg-muted text-muted-foreground`} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Phone
        <input name="phone" type="tel" defaultValue={phone ?? ''} autoComplete="tel" maxLength={40} className={fieldClass} />
      </label>
      {state?.message && (
        <p className={state.ok ? 'text-sm text-chart-3' : 'text-sm text-destructive'} role="status">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" className="h-10 w-fit px-5 font-semibold" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Save details
      </Button>
    </form>
  )
}
