import { createFileRoute } from '@tanstack/react-router'
import { FeaturePlaceholder } from '@/components/shared/feature-placeholder'

export const Route = createFileRoute('/_app/referrals')({
  component: () => (
    <FeaturePlaceholder
      title="Referrals"
      description="Referral codes, commission, and withdrawal requests will be added with their guarded workflows."
    />
  ),
})
