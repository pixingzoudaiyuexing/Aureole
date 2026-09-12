import { createFileRoute } from '@tanstack/react-router'
import { FeaturePlaceholder } from '@/components/shared/feature-placeholder'

export const Route = createFileRoute('/_app/resources')({
  component: () => (
    <FeaturePlaceholder
      title="Resources"
      description="Authenticated service resources will appear here without exposing upstream configuration."
    />
  ),
})
