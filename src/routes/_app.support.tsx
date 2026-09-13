import { createFileRoute } from '@tanstack/react-router'
import { TicketsPage } from '@/features/tickets/tickets-page'

export const Route = createFileRoute('/_app/support')({
  component: TicketsPage,
})
