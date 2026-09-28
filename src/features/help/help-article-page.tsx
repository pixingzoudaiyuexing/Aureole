import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { ReadError } from '@/components/shared/read-error'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { ApiError } from '@/lib/api/errors'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { HelpArticleContent } from './help-content'
import { useHelpArticle } from './help-queries'

export function HelpArticlePage({ id }: { id: string }) {
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  if (!accessToken) return null
  return <HelpArticleContentPage accessToken={accessToken} id={id} />
}

function HelpArticleContentPage({
  accessToken,
  id,
}: {
  accessToken: string
  id: string
}) {
  const article = useHelpArticle(accessToken, id)
  useExitOnInvalidSessionError(article.error)
  if (isInvalidSessionError(article.error)) return null

  const isNotFound =
    article.error instanceof ApiError &&
    article.error.code === 'HELP_ARTICLE_NOT_FOUND'
  const unavailable =
    article.error instanceof ApiError &&
    article.error.code === 'HELP_UNAVAILABLE'
  return (
    <div className="mx-auto max-w-3xl pb-12">
      <Link
        className="inline-flex items-center gap-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        to="/help"
        search={{ q: undefined, category: undefined, page: 1 }}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        帮助中心
      </Link>
      {article.isPending ? (
        <p className="mt-8 text-sm text-muted-foreground" role="status">
          正在读取文章…
        </p>
      ) : isNotFound ? (
        <p className="mt-8 text-sm" role="alert">
          文章不存在或不可访问。
        </p>
      ) : unavailable ? (
        <div className="mt-8">
          <ReadError
            message="内容暂时无法加载，请稍后重试。"
            error={article.error}
            retry={() => void article.refetch()}
          />
        </div>
      ) : article.isError ? (
        <div className="mt-8">
          <ReadError
            message="暂时无法读取文章。"
            error={article.error}
            retry={() => void article.refetch()}
          />
        </div>
      ) : (
        <article className="mt-6">
          <header className="border-b border-border pb-6">
            <h2 className="break-words text-2xl font-semibold sm:text-3xl">
              {article.data.title}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {article.data.category} ·{' '}
              {new Intl.DateTimeFormat('zh-CN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              }).format(new Date(article.data.updatedAt))}
            </p>
          </header>
          <div className="pt-8">
            <HelpArticleContent blocks={article.data.blocks} />
          </div>
        </article>
      )}
    </div>
  )
}
