import { createFileRoute } from '@tanstack/react-router'
import { FeaturePlaceholder } from '@/components/shared/feature-placeholder'

export const Route = createFileRoute('/_app/settings')({
  component: () => (
    <FeaturePlaceholder
      title="Account"
      description="Profile preferences and password management will be connected to the public account contract."
    />
  ),
})
