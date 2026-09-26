import { createFileRoute } from '@tanstack/react-router'
import { AppleIdPage } from '@/features/apple-id/apple-id-page'

export const Route = createFileRoute('/_app/apple-id')({
  component: AppleIdPage,
})
