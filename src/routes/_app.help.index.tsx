import { createFileRoute } from '@tanstack/react-router'
import { HelpPage } from '@/features/help/help-page'

export const Route = createFileRoute('/_app/help/')({
  validateSearch: (search: Record<string, unknown>) => ({
    q:
      typeof search.q === 'string' && search.q.trim().length <= 128
        ? search.q.trim() || undefined
        : undefined,
    category:
      typeof search.category === 'string' &&
      search.category.trim().length <= 255
        ? search.category.trim() || undefined
        : undefined,
    page:
      typeof search.page === 'number' &&
      Number.isInteger(search.page) &&
      search.page > 0 &&
      search.page <= 10_000
        ? search.page
        : 1,
  }),
  component: HelpRoute,
})

function HelpRoute() {
  return <HelpPage filters={Route.useSearch()} />
}
