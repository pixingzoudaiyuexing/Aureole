import { Orbit } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Orbit className="size-5" aria-hidden="true" />
      </span>
      <span className="text-base font-semibold text-foreground">Aureole</span>
    </div>
  )
}
