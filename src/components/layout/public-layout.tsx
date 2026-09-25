import { Link, Outlet } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Brand } from '@/components/layout/brand'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { AnnouncementsSurface } from '@/features/announcements/announcements-surface'
import { useRuntimeSettings } from '@/features/runtime-settings/runtime-settings-context'

export function PublicLayout() {
  const { footerText } = useRuntimeSettings()

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(19rem,38%)_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-border bg-foreground p-10 text-background lg:flex lg:flex-col lg:justify-between">
        <Brand className="[&_span:last-child]:text-background" />
        <div className="max-w-sm">
          <div className="mb-6 h-px w-14 bg-primary" />
          <p className="text-3xl font-medium leading-tight">
            Your services, one clear view.
          </p>
          <p className="mt-4 text-sm leading-6 text-background/65">
            Manage access, billing, and support from a focused account portal.
          </p>
        </div>
        <p className="text-xs text-background/50">{footerText}</p>
      </aside>

      <main className="flex min-h-screen flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border px-4 sm:px-6">
          <Link
            to="/login"
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring lg:invisible"
          >
            <Brand />
          </Link>
          <ThemeToggle />
        </header>
        <AnnouncementsSurface />
        <div className="flex flex-1 items-center-safe justify-center px-5 py-12 sm:px-8">
          <Outlet />
        </div>
        <footer className="px-6 py-5 text-center text-xs text-muted-foreground">
          <div className="flex items-center justify-center gap-4">
            <Link
              to="/downloads"
              className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              下载中心
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Return to sign in
            </Link>
          </div>
        </footer>
      </main>
    </div>
  )
}
