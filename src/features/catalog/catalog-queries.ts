import { queryOptions, useQuery } from '@tanstack/react-query'
import { catalogApi } from './catalog-api'

export const catalogQueryKeys = {
  products: ['products'] as const,
}

export function productsQueryOptions(accessToken: string) {
  return queryOptions({
    queryKey: catalogQueryKeys.products,
    queryFn: () => catalogApi.getProducts(accessToken),
  })
}

export function useProducts(accessToken: string) {
  return useQuery(productsQueryOptions(accessToken))
}
