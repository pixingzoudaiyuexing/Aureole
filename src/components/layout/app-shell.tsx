import { Outlet, useRouterState } from '@tanstack/react-router'
import { Menu } from 'lucide-react'
import { Brand } from '@/components/layout/brand'
import { SidebarNavigation } from '@/components/layout/sidebar-navigation'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { navigationItems } from '@/config/navigation'
import { AccountSummary } from '@/features/auth/account-summary'

export function AppShell() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const pageTitle =
    navigationItems.find((item) => item.to === pathname)?.label ?? 'Aureole'

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-border bg-card lg:flex lg:h-screen lg:flex-col lg:sticky lg:top-0">
        <div className="flex h-16 items-center px-5">
          <Brand />
        </div>
        <Separator />
        <SidebarNavigation />
        <AccountSummary />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-6">
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
                <SidebarNavigation closeOnNavigate />
                <AccountSummary />
              </SheetContent>
            </Sheet>
          </div>

          <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">
            {pageTitle}
          </h1>
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-[82rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
