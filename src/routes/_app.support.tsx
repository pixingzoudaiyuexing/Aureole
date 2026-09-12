import { createFileRoute } from '@tanstack/react-router'
import { FeaturePlaceholder } from '@/components/shared/feature-placeholder'

export const Route = createFileRoute('/_app/support')({
  component: () => (
    <FeaturePlaceholder
      title="Support"
      description="Support tickets and replies will be connected after the core account experience is ready."
    />
  ),
})
