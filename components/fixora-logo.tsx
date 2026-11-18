import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export function FixoraLogo({
  variant = 'dark',
  className,
  href = '/',
}: {
  variant?: 'dark' | 'light'
  className?: string
  href?: string
}) {
  return (
    <Link href={href} className={cn('inline-flex shrink-0 items-center', className)} aria-label="Fixora home">
      <Image
        src={variant === 'dark' ? '/images/fixora-logo-dark.png' : '/images/fixora-logo-light.png'}
        alt="Fixora — Book, Fix, Relax"
        width={910}
        height={300}
        priority
        className="h-10 w-auto"
      />
    </Link>
  )
}
