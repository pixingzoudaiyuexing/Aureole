import {
  Bell,
  BookOpen,
  Boxes,
  CircleUserRound,
  CreditCard,
  Download,
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
import {
  getCustomPageIdFromPath,
  getCustomPagePath,
} from '@/features/custom-pages/custom-pages-routing'
import type { NavigationData } from '@/features/navigation/navigation-api'

export type AppPath =
  | '/dashboard'
  | '/subscription'
  | '/plans'
  | '/resources'
  | '/apple-id'
  | '/orders'
  | '/wallet'
  | '/notices'
  | '/help'
  | '/support'
  | '/referrals'
  | '/settings'

export interface InternalNavigationItem {
  kind: 'internal'
  label: string
  to: AppPath | '/downloads'
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

const coreTargets = {
  dashboard: { label: 'Overview', to: '/dashboard', icon: Gauge },
  subscription: {
    label: 'Subscription',
    to: '/subscription',
    icon: CreditCard,
  },
  plans: { label: 'Plans', to: '/plans', icon: PackageOpen },
  resources: { label: 'Resources', to: '/resources', icon: Boxes },
  'apple-id': { label: 'Apple ID', to: '/apple-id', icon: KeyRound },
  orders: { label: 'Orders', to: '/orders', icon: ReceiptText },
  wallet: { label: 'Wallet', to: '/wallet', icon: WalletCards },
  notices: { label: 'Notices', to: '/notices', icon: Bell },
  'help-center': { label: '帮助中心', to: '/help', icon: BookOpen },
  support: { label: 'Support', to: '/support', icon: Headphones },
  referrals: { label: 'Referrals', to: '/referrals', icon: Share2 },
  'download-center': { label: '下载中心', to: '/downloads', icon: Download },
} satisfies Record<string, Omit<InternalNavigationItem, 'kind'>>

type CoreTargetId = keyof typeof coreTargets

const fallbackCoreIds: CoreTargetId[] = [
  'dashboard',
  'subscription',
  'plans',
  'resources',
  'apple-id',
  'orders',
  'wallet',
  'notices',
  'help-center',
  'support',
  'referrals',
]

function isKnownCoreTarget(id: string): id is CoreTargetId {
  return Object.hasOwn(coreTargets, id)
}

function coreItem(
  id: CoreTargetId,
  label = coreTargets[id].label,
): InternalNavigationItem {
  return {
    kind: 'internal',
    label,
    to: coreTargets[id].to,
    icon: coreTargets[id].icon,
  }
}

const accountNavigationItem: InternalNavigationItem = {
  kind: 'internal',
  label: 'Account',
  to: '/settings',
  icon: CircleUserRound,
}

function customItem(page: CustomPage, label = page.title): NavigationItem {
  return page.mode === 'external'
    ? {
        kind: 'custom-external',
        id: page.id,
        label,
        href: page.url,
        icon: PanelsTopLeft,
      }
    : {
        kind: 'custom-iframe',
        id: page.id,
        label,
        to: '/custom/$customPageId',
        params: { customPageId: page.id },
        path: getCustomPagePath(page.id),
        icon: PanelsTopLeft,
      }
}

export function buildNavigationItems(
  pages: readonly CustomPage[],
): NavigationItem[] {
  return [
    ...fallbackCoreIds.map((id) => coreItem(id)),
    ...pages.map((page) => customItem(page)),
    accountNavigationItem,
  ]
}

export function resolveNavigationItems(
  navigation: NavigationData | null,
  pages: readonly CustomPage[],
): NavigationItem[] {
  if (!navigation) return buildNavigationItems(pages)

  const knownCore = new Set<CoreTargetId>()
  const customIds = new Set<string>()
  const pageById = new Map(pages.map((page) => [page.id, page]))
  const items: NavigationItem[] = []

  for (const item of navigation.items) {
    if (item.kind === 'core') {
      if (!isKnownCoreTarget(item.targetId)) continue
      if (knownCore.has(item.targetId)) return buildNavigationItems(pages)
      knownCore.add(item.targetId)
      items.push(coreItem(item.targetId, item.label))
    } else {
      if (customIds.has(item.itemId)) return buildNavigationItems(pages)
      customIds.add(item.itemId)
      const page = pageById.get(item.itemId)
      if (page) items.push(customItem(page, item.label))
    }
  }

  if (!knownCore.has('dashboard')) return buildNavigationItems(pages)
  return [...items, accountNavigationItem]
}

export function getNavigationPageTitle(
  pathname: string,
  pages: readonly CustomPage[],
  items: readonly NavigationItem[] = buildNavigationItems(pages),
) {
  const titlePath = pathname.startsWith('/help/') ? '/help' : pathname
  const item = items.find((candidate) => {
    if (candidate.kind === 'internal') return candidate.to === titlePath
    if (candidate.kind === 'custom-iframe') return candidate.path === pathname
    return false
  })
  if (item) return item.label

  const core = fallbackCoreIds.find((id) => coreTargets[id].to === titlePath)
  if (core) return coreTargets[core].label
  if (pathname === '/settings') return accountNavigationItem.label
  const customId = getCustomPageIdFromPath(pathname)
  return (
    pages.find((page) => page.id === customId && page.mode === 'iframe')
      ?.title ?? 'Aureole'
  )
}
