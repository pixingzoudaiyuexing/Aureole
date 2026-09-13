import { createFileRoute } from '@tanstack/react-router'
import { NoticesPage } from '@/features/notices/notices-page'

export const Route = createFileRoute('/_app/notices')({
  component: NoticesPage,
})
