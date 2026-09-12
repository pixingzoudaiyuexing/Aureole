import { CircleDashed } from 'lucide-react'

interface FeaturePlaceholderProps {
  title: string
  description: string
}

export function FeaturePlaceholder({
  title,
  description,
}: FeaturePlaceholderProps) {
  return (
    <section aria-labelledby="feature-title">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase text-primary">
          Account workspace
        </p>
        <h2
          id="feature-title"
          className="mt-2 text-2xl font-semibold sm:text-3xl"
        >
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          {description}
        </p>
      </div>

      <div className="mt-10 flex max-w-3xl items-start gap-4 border-y border-border py-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          <CircleDashed className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Not connected yet</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            This area is reserved for a later milestone. No sample account or
            business data is shown.
          </p>
        </div>
      </div>
    </section>
  )
}
