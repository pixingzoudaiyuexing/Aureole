import { Link } from '@tanstack/react-router'
import { SheetClose } from '@/components/ui/sheet'
import { navigationItems } from '@/config/navigation'

export function SidebarNavigation({ closeOnNavigate = false }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4" aria-label="Primary">
      {navigationItems.map((item) => {
        const Icon = item.icon
        const link = (
          <Link
            to={item.to}
            className="group relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
            activeProps={{
              className:
                'bg-secondary text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary',
              'aria-current': 'page',
            }}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        )

        return closeOnNavigate ? (
          <SheetClose asChild key={item.to}>
            {link}
          </SheetClose>
        ) : (
          <div key={item.to}>{link}</div>
        )
      })}
    </nav>
  )
}
