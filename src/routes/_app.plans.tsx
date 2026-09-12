import { createFileRoute } from '@tanstack/react-router'
import { FeaturePlaceholder } from '@/components/shared/feature-placeholder'

export const Route = createFileRoute('/_app/plans')({
  component: () => (
    <FeaturePlaceholder
      title="Plans"
      description="Available products and billing periods will appear here when the catalog is connected."
    />
  ),
})
