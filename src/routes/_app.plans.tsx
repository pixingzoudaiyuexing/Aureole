import { createFileRoute } from '@tanstack/react-router'
import { PlansPage } from '@/features/catalog/plans-page'

export const Route = createFileRoute('/_app/plans')({
  component: PlansPage,
})
