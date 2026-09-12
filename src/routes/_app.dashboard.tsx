import { createFileRoute } from '@tanstack/react-router'
import { FeaturePlaceholder } from '@/components/shared/feature-placeholder'

export const Route = createFileRoute('/_app/dashboard')({
  component: () => (
    <FeaturePlaceholder
      title="Overview"
      description="Your account and subscription summary will appear here after secure sign-in is connected."
    />
  ),
})
