import { Check, X } from 'lucide-react'
import type { Product } from './catalog-api'

export function ProductFeatures({
  features,
}: {
  features: Product['features']
}) {
  if (!features?.length) return null

  return (
    <ul aria-label="套餐功能" className="mt-4 min-w-0 space-y-2 text-sm">
      {features.map(({ feature, support }, index) => (
        <li
          key={index}
          className={`flex min-w-0 items-start gap-2 ${support ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {support ? (
            <Check
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400"
            />
          ) : (
            <X aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          <span className="sr-only">{support ? '支持' : '不支持'}</span>
          <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {feature}
          </span>
        </li>
      ))}
    </ul>
  )
}
