import { Link } from '@tanstack/react-router'
import { ArrowRight, LockKeyhole } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AuthPlaceholderProps {
  eyebrow: string
  title: string
  description: string
  secondaryLabel?: string
  secondaryTo?: '/login' | '/register' | '/forgot-password'
}

export function AuthPlaceholder({
  eyebrow,
  title,
  description,
  secondaryLabel,
  secondaryTo,
}: AuthPlaceholderProps) {
  return (
    <section className="w-full max-w-[26rem]" aria-labelledby="auth-title">
      <span className="flex size-11 items-center justify-center rounded-md bg-secondary text-primary">
        <LockKeyhole className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-8 text-xs font-semibold uppercase text-primary">
        {eyebrow}
      </p>
      <h1 id="auth-title" className="mt-2 text-3xl font-semibold">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {description}
      </p>

      <div className="mt-8 border-y border-border py-5">
        <p className="text-sm font-medium">Account access is being prepared.</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Authentication will be connected to the secure public API in the next
          milestone.
        </p>
      </div>

      {secondaryLabel && secondaryTo ? (
        <Link
          to={secondaryTo}
          className={cn(buttonVariants({ variant: 'outline' }), 'mt-6 w-full')}
        >
          {secondaryLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </section>
  )
}
