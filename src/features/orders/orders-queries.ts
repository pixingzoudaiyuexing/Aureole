import { queryOptions, useQuery } from '@tanstack/react-query'
import { ordersApi } from './orders-api'

export const ordersQueryKeys = {
  list: ['orders', 'list'] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
}

export function ordersListOptions(accessToken: string) {
  return queryOptions({
    queryKey: ordersQueryKeys.list,
    queryFn: () => ordersApi.getList(accessToken),
  })
}

export function useOrders(accessToken: string) {
  return useQuery(ordersListOptions(accessToken))
}

export function useOrderDetail(accessToken: string, id: string | null) {
  return useQuery({
    queryKey: id ? ordersQueryKeys.detail(id) : ['orders', 'detail', 'none'],
    queryFn: () => ordersApi.getDetail(accessToken, id!),
    enabled: id !== null,
  })
}
