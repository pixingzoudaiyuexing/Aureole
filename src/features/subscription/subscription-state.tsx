import type { ReactNode } from 'react'

export function SubscriptionSection({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section
      className="grid gap-5 border-t border-border py-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10"
      aria-labelledby={id}
    >
      <div>
        <h3 id={id} className="text-base font-semibold">
          {title}
        </h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}
