import { Orbit } from 'lucide-react'
import { useState } from 'react'
import { useRuntimeSettings } from '@/features/runtime-settings/runtime-settings-context'
import { cn } from '@/lib/utils'

function RuntimeLogo({ logoUrl }: { logoUrl: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) return <Orbit className="size-5" aria-hidden="true" />

  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden="true"
      referrerPolicy="no-referrer"
      className="size-5 object-contain"
      onError={() => setFailed(true)}
    />
  )
}

export function Brand({ className }: { className?: string }) {
  const { brandName, logoUrl } = useRuntimeSettings()

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
        {logoUrl ? (
          <RuntimeLogo key={logoUrl} logoUrl={logoUrl} />
        ) : (
          <Orbit className="size-5" aria-hidden="true" />
        )}
      </span>
      <span className="text-base font-semibold text-foreground">
        {brandName}
      </span>
    </div>
  )
}
