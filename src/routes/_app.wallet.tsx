import { createFileRoute } from '@tanstack/react-router'
import { FeaturePlaceholder } from '@/components/shared/feature-placeholder'

export const Route = createFileRoute('/_app/wallet')({
  component: () => (
    <FeaturePlaceholder
      title="Wallet"
      description="Balance, deposits, and gift card redemption will be added with the financial workflow."
    />
  ),
})
