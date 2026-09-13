import { createFileRoute } from '@tanstack/react-router'
import { WalletPage } from '@/features/wallet/wallet-page'

export const Route = createFileRoute('/_app/wallet')({
  component: WalletPage,
})
