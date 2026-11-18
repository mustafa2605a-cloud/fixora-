import { Hammer, Paintbrush, Snowflake, Sparkles, Wrench, Zap, type LucideProps } from 'lucide-react'
import type { ServiceCategory } from '@/lib/data'

const icons = {
  wrench: Wrench,
  zap: Zap,
  snowflake: Snowflake,
  sparkles: Sparkles,
  hammer: Hammer,
  paintbrush: Paintbrush,
}

export function ServiceIcon({ name, ...props }: { name: ServiceCategory['icon'] } & LucideProps) {
  const Icon = icons[name]
  return <Icon aria-hidden="true" {...props} />
}
