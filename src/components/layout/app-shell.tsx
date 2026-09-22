import { Outlet, useRouterState } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { Brand } from '@/components/layout/brand'
import { SidebarNavigation } from '@/components/layout/sidebar-navigation'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { getNavigationPageTitle } from '@/config/navigation'
import { AccountSummary } from '@/features/auth/account-summary'
import { AnnouncementsSurface } from '@/features/announcements/announcements-surface'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { useCustomPages } from '@/features/custom-pages/custom-pages-queries'
import { isCustomPageRoutePath } from '@/features/custom-pages/custom-pages-routing'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { cn } from '@/lib/utils'

export function AppShell() {
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  const customPagesQuery = useCustomPages(accessToken)
  useExitOnInvalidSessionError(customPagesQuery.error)

  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const customPages = customPagesQuery.isError
    ? []
    : (customPagesQuery.data?.items ?? [])
  const pageTitle = getNavigationPageTitle(pathname, customPages)
  const customPageLayout = isCustomPageRoutePath(pathname)

  return (
    <div
      className={cn(
        'min-h-screen bg-background lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]',
        customPageLayout && 'h-[100dvh] min-h-0 overflow-hidden',
      )}
    >
      <aside className="hidden border-r border-border bg-card lg:flex lg:h-screen lg:flex-col lg:sticky lg:top-0">
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>
        <Separator />
        <SidebarNavigation customPages={customPages} />
        <AccountSummary />
      </aside>

      <div
        className={cn(
          'min-w-0',
          customPageLayout && 'flex h-full min-h-0 flex-col',
        )}
      >
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-6">
          <div className="lg:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation"
                >
                  <Menu className="size-5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent className="flex flex-col pt-16">
                <div className="absolute left-5 top-3">
                  <Brand />
                </div>
                <Separator />
                <SidebarNavigation customPages={customPages} closeOnNavigate />
                <AccountSummary />
              </SheetContent>
            </Sheet>
          </div>

          <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">
            {pageTitle}
          </h1>
          <ThemeToggle />
        </header>
        <AnnouncementsSurface />

        <main
          data-layout={customPageLayout ? 'custom-page' : 'standard'}
          className={
            customPageLayout
              ? 'flex min-h-0 w-full flex-1 overflow-hidden'
              : 'mx-auto w-full max-w-[82rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-10'
          }
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
