import { queryOptions, useQuery } from '@tanstack/react-query'
import { catalogApi } from './catalog-api'

export const catalogQueryKeys = {
  products: ['products'] as const,
  detail: (id: string) => ['products', 'detail', id] as const,
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

export function productDetailQueryOptions(accessToken: string, id: string) {
  return queryOptions({
    queryKey: catalogQueryKeys.detail(id),
    queryFn: () => catalogApi.getProduct(accessToken, id),
  })
}

export function useProductDetail(accessToken: string, id: string) {
  return useQuery(productDetailQueryOptions(accessToken, id))
}
