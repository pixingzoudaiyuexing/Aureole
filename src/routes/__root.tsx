import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { buttonVariants } from '@/components/ui/button'

function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="max-w-md text-center">
        <p className="text-sm font-semibold text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The address may have changed or is not available yet.
        </p>
        <Link to="/login" className={`${buttonVariants()} mt-6`}>
          Return to sign in
        </Link>
      </section>
    </main>
  )
}

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
})
