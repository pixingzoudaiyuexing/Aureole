import { createFileRoute } from '@tanstack/react-router'
import { FeaturePlaceholder } from '@/components/shared/feature-placeholder'

export const Route = createFileRoute('/_app/notices')({
  component: () => (
    <FeaturePlaceholder
      title="Notices"
      description="Account notices will appear here when the authenticated read-only features are connected."
    />
  ),
})
