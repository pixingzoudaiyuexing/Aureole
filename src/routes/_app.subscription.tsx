import { createFileRoute } from '@tanstack/react-router'
import { FeaturePlaceholder } from '@/components/shared/feature-placeholder'

export const Route = createFileRoute('/_app/subscription')({
  component: () => (
    <FeaturePlaceholder
      title="Subscription"
      description="Subscription status, usage, and access controls will be connected in a later milestone."
    />
  ),
})
