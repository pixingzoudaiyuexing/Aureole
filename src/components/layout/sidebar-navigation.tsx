import { Link } from '@tanstack/react-router'
import { SheetClose } from '@/components/ui/sheet'
import { navigationItems, type NavigationItem } from '@/config/navigation'

const linkClassName =
  'group relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring'

const activeProps = {
  className:
    'bg-secondary text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary',
  'aria-current': 'page' as const,
}

function NavigationLink({ item }: { item: NavigationItem }) {
  const Icon = item.icon

  if (item.kind === 'custom-external') {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        <Icon className="size-[18px] shrink-0" aria-hidden="true" />
        <span>{item.label}</span>
        <span className="sr-only">（在新窗口打开）</span>
      </a>
    )
  }

  if (item.kind === 'custom-iframe') {
    return (
      <Link
        to={item.to}
        params={item.params}
        className={linkClassName}
        activeProps={activeProps}
      >
        <Icon className="size-[18px] shrink-0" aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <Link to={item.to} className={linkClassName} activeProps={activeProps}>
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  )
}

export function SidebarNavigation({ closeOnNavigate = false }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4" aria-label="Primary">
      {navigationItems.map((item) => {
        const key =
          item.kind === 'internal' ? item.to : `${item.kind}:${item.id}`
        const link = <NavigationLink item={item} />

        return closeOnNavigate ? (
          <SheetClose asChild key={key}>
            {link}
          </SheetClose>
        ) : (
          <div key={key}>{link}</div>
        )
      })}
    </nav>
  )
}
