import { createFileRoute } from '@tanstack/react-router'
import { FeaturePlaceholder } from '@/components/shared/feature-placeholder'

export const Route = createFileRoute('/_app/orders')({
  component: () => (
    <FeaturePlaceholder
      title="Orders"
      description="Order history and checkout status will be connected through the public API in a later milestone."
    />
  ),
})
