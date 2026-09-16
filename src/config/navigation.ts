import {
  Activity,
  Bell,
  BookOpen,
  Boxes,
  CircleUserRound,
  CreditCard,
  Gauge,
  Headphones,
  PackageOpen,
  PanelsTopLeft,
  ReceiptText,
  Share2,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'
import {
  customPages,
  getCustomPagePath,
  getEnabledCustomPages,
  type CustomPage,
  type SupportedCustomPageIcon,
} from './custom-pages'

export type AppPath =
  | '/dashboard'
  | '/subscription'
  | '/plans'
  | '/resources'
  | '/orders'
  | '/wallet'
  | '/notices'
  | '/support'
  | '/referrals'
  | '/settings'

export interface InternalNavigationItem {
  kind: 'internal'
  label: string
  to: AppPath
  icon: LucideIcon
}

export interface CustomIframeNavigationItem {
  kind: 'custom-iframe'
  id: string
  label: string
  to: '/custom/$customPageId'
  params: { customPageId: string }
  path: `/custom/${string}`
  icon: LucideIcon
}

export interface CustomExternalNavigationItem {
  kind: 'custom-external'
  id: string
  label: string
  href: string
  icon: LucideIcon
}

export type NavigationItem =
  | InternalNavigationItem
  | CustomIframeNavigationItem
  | CustomExternalNavigationItem

const customPageIconMap: Record<SupportedCustomPageIcon, LucideIcon> = {
  book: BookOpen,
  activity: Activity,
  panel: PanelsTopLeft,
}

const coreNavigationItems: InternalNavigationItem[] = [
  { kind: 'internal', label: 'Overview', to: '/dashboard', icon: Gauge },
  {
    kind: 'internal',
    label: 'Subscription',
    to: '/subscription',
    icon: CreditCard,
  },
  { kind: 'internal', label: 'Plans', to: '/plans', icon: PackageOpen },
  { kind: 'internal', label: 'Resources', to: '/resources', icon: Boxes },
  { kind: 'internal', label: 'Orders', to: '/orders', icon: ReceiptText },
  { kind: 'internal', label: 'Wallet', to: '/wallet', icon: WalletCards },
  { kind: 'internal', label: 'Notices', to: '/notices', icon: Bell },
  { kind: 'internal', label: 'Support', to: '/support', icon: Headphones },
  { kind: 'internal', label: 'Referrals', to: '/referrals', icon: Share2 },
]

const accountNavigationItem: InternalNavigationItem = {
  kind: 'internal',
  label: 'Account',
  to: '/settings',
  icon: CircleUserRound,
}

function customPageIcon(page: CustomPage) {
  return page.icon ? customPageIconMap[page.icon] : PanelsTopLeft
}

export function buildNavigationItems(pages: readonly CustomPage[]) {
  const customNavigationItems: NavigationItem[] = getEnabledCustomPages(
    pages,
  ).map((page) =>
    page.mode === 'external'
      ? {
          kind: 'custom-external',
          id: page.id,
          label: page.title,
          href: page.url,
          icon: customPageIcon(page),
        }
      : {
          kind: 'custom-iframe',
          id: page.id,
          label: page.title,
          to: '/custom/$customPageId',
          params: { customPageId: page.id },
          path: getCustomPagePath(page.id),
          icon: customPageIcon(page),
        },
  )

  return [
    ...coreNavigationItems,
    ...customNavigationItems,
    accountNavigationItem,
  ]
}

export const navigationItems = buildNavigationItems(customPages)

export function getNavigationPageTitle(pathname: string) {
  const item = navigationItems.find((candidate) => {
    if (candidate.kind === 'internal') return candidate.to === pathname
    if (candidate.kind === 'custom-iframe') return candidate.path === pathname
    return false
  })
  return item?.label ?? 'Aureole'
}
