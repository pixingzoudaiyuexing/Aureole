import {
  Bell,
  Boxes,
  CircleUserRound,
  CreditCard,
  Gauge,
  Headphones,
  KeyRound,
  PackageOpen,
  PanelsTopLeft,
  ReceiptText,
  Share2,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'
import type { CustomPage } from '@/features/custom-pages/custom-pages-api'
import { getCustomPagePath } from '@/features/custom-pages/custom-pages-routing'

export type AppPath =
  | '/dashboard'
  | '/subscription'
  | '/plans'
  | '/resources'
  | '/apple-id'
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
  { kind: 'internal', label: 'Apple ID', to: '/apple-id', icon: KeyRound },
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

export function buildNavigationItems(pages: readonly CustomPage[]) {
  const customNavigationItems: NavigationItem[] = pages.map((page) =>
    page.mode === 'external'
      ? {
          kind: 'custom-external',
          id: page.id,
          label: page.title,
          href: page.url,
          icon: PanelsTopLeft,
        }
      : {
          kind: 'custom-iframe',
          id: page.id,
          label: page.title,
          to: '/custom/$customPageId',
          params: { customPageId: page.id },
          path: getCustomPagePath(page.id),
          icon: PanelsTopLeft,
        },
  )

  return [
    ...coreNavigationItems,
    ...customNavigationItems,
    accountNavigationItem,
  ]
}

export function getNavigationPageTitle(
  pathname: string,
  pages: readonly CustomPage[],
) {
  const item = buildNavigationItems(pages).find((candidate) => {
    if (candidate.kind === 'internal') return candidate.to === pathname
    if (candidate.kind === 'custom-iframe') return candidate.path === pathname
    return false
  })
  return item?.label ?? 'Aureole'
}
