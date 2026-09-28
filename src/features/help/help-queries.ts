import { queryOptions, useQuery } from '@tanstack/react-query'
import { helpApi, type HelpFilters } from './help-api'

export const helpQueryKeys = {
  categories: ['help', 'categories'] as const,
  articles: (filters: HelpFilters) => ['help', 'articles', filters] as const,
  article: (id: string) => ['help', 'article', id] as const,
}

export function useHelpCategories(accessToken: string) {
  return useQuery(
    queryOptions({
      queryKey: helpQueryKeys.categories,
      queryFn: () => helpApi.getCategories(accessToken),
    }),
  )
}

export function useHelpArticles(accessToken: string, filters: HelpFilters) {
  return useQuery(
    queryOptions({
      queryKey: helpQueryKeys.articles(filters),
      queryFn: () => helpApi.getArticles(accessToken, filters),
    }),
  )
}

export function useHelpArticle(accessToken: string, id: string) {
  return useQuery(
    queryOptions({
      queryKey: helpQueryKeys.article(id),
      queryFn: () => helpApi.getArticle(accessToken, id),
    }),
  )
}
