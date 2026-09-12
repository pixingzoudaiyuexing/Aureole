import {
  Bell,
  Boxes,
  CircleUserRound,
  CreditCard,
  Gauge,
  Headphones,
  PackageOpen,
  ReceiptText,
  Share2,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'

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

export interface NavigationItem {
  label: string
  to: AppPath
  icon: LucideIcon
}

export const navigationItems: NavigationItem[] = [
  { label: 'Overview', to: '/dashboard', icon: Gauge },
  { label: 'Subscription', to: '/subscription', icon: CreditCard },
  { label: 'Plans', to: '/plans', icon: PackageOpen },
  { label: 'Resources', to: '/resources', icon: Boxes },
  { label: 'Orders', to: '/orders', icon: ReceiptText },
  { label: 'Wallet', to: '/wallet', icon: WalletCards },
  { label: 'Notices', to: '/notices', icon: Bell },
  { label: 'Support', to: '/support', icon: Headphones },
  { label: 'Referrals', to: '/referrals', icon: Share2 },
  { label: 'Account', to: '/settings', icon: CircleUserRound },
]
