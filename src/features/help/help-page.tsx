import { Link, useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import type { FormEvent } from 'react'
import { ReadError } from '@/components/shared/read-error'
import { Button } from '@/components/ui/button'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import type { HelpFilters } from './help-api'
import { useHelpArticles, useHelpCategories } from './help-queries'

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

export function HelpPage({ filters }: { filters: HelpFilters }) {
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  if (!accessToken) return null
  return <HelpContent accessToken={accessToken} filters={filters} />
}

function HelpContent({
  accessToken,
  filters,
}: {
  accessToken: string
  filters: HelpFilters
}) {
  const navigate = useNavigate()
  const categories = useHelpCategories(accessToken)
  const articles = useHelpArticles(accessToken, filters)
  useExitOnInvalidSessionError(categories.error)
  useExitOnInvalidSessionError(articles.error)
  if (
    isInvalidSessionError(categories.error) ||
    isInvalidSessionError(articles.error)
  )
    return null

  const changeSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input = event.currentTarget.elements.namedItem(
      'q',
    ) as HTMLInputElement
    void navigate({
      to: '/help',
      search: {
        q: input.value.trim() || undefined,
        category: filters.category,
        page: 1,
      },
    })
  }
  const changeCategory = (category?: string) => {
    void navigate({ to: '/help', search: { q: filters.q, category, page: 1 } })
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="pb-8">
        <h2 className="text-2xl font-semibold sm:text-3xl">帮助中心</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          查找使用说明与常见问题。
        </p>
      </div>
      <form
        className="flex max-w-2xl gap-2 border-t border-border pt-6"
        onSubmit={changeSearch}
        role="search"
      >
        <input
          aria-label="搜索文章"
          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue={filters.q ?? ''}
          key={filters.q ?? ''}
          maxLength={128}
          name="q"
          placeholder="搜索文章"
          type="search"
        />
        <Button size="sm" type="submit">
          <Search className="size-4" aria-hidden="true" />
          搜索
        </Button>
      </form>
      <section className="border-b border-border py-6" aria-label="文章分类">
        {categories.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            正在读取分类…
          </p>
        ) : categories.isError ? (
          <ReadError
            message="暂时无法读取分类。"
            error={categories.error}
            retry={() => void categories.refetch()}
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              type="button"
              variant={filters.category ? 'outline' : 'default'}
              onClick={() => changeCategory()}
            >
              全部
            </Button>
            {categories.data.categories.map((category) => (
              <Button
                key={category.name}
                size="sm"
                type="button"
                variant={
                  filters.category === category.name ? 'default' : 'outline'
                }
                onClick={() => changeCategory(category.name)}
              >
                {category.name}{' '}
                <span className="text-xs opacity-70">
                  {category.articleCount}
                </span>
              </Button>
            ))}
          </div>
        )}
      </section>
      <section aria-label="文章列表" className="py-6">
        {articles.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            正在读取文章…
          </p>
        ) : articles.isError ? (
          <ReadError
            message="暂时无法读取文章。"
            error={articles.error}
            retry={() => void articles.refetch()}
          />
        ) : articles.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">没有找到相关文章。</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {articles.data.items.map((article) => (
              <li className="py-5" key={article.id}>
                <Link
                  className="break-words text-base font-semibold text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  params={{ articleId: article.id }}
                  to="/help/$articleId"
                >
                  {article.title}
                </Link>
                <p className="mt-2 text-xs text-muted-foreground">
                  {article.category} · {formatUpdatedAt(article.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {articles.data && articles.data.total > articles.data.pageSize ? (
          <nav
            aria-label="文章分页"
            className="mt-6 flex items-center justify-between gap-3"
          >
            <Button
              disabled={filters.page <= 1}
              onClick={() =>
                void navigate({
                  to: '/help',
                  search: {
                    q: filters.q,
                    category: filters.category,
                    page: filters.page - 1,
                  },
                })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              上一页
            </Button>
            <span className="text-sm text-muted-foreground">
              第 {articles.data.page} 页
            </span>
            <Button
              disabled={
                filters.page * articles.data.pageSize >= articles.data.total
              }
              onClick={() =>
                void navigate({
                  to: '/help',
                  search: {
                    q: filters.q,
                    category: filters.category,
                    page: filters.page + 1,
                  },
                })
              }
              size="sm"
              type="button"
              variant="outline"
            >
              下一页
            </Button>
          </nav>
        ) : null}
      </section>
    </div>
  )
}
