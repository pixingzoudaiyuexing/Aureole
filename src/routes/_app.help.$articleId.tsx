import { createFileRoute } from '@tanstack/react-router'
import { HelpArticlePage } from '@/features/help/help-article-page'

export const Route = createFileRoute('/_app/help/$articleId')({
  component: HelpArticleRoute,
})

function HelpArticleRoute() {
  return <HelpArticlePage id={Route.useParams().articleId} />
}
