import { queryOptions, useQuery } from '@tanstack/react-query'
import { ordersApi } from './orders-api'

export const ordersQueryKeys = {
  list: ['orders', 'list'] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  status: (id: string) => ['orders', 'status', id] as const,
}

export function orderStatusOptions(accessToken: string, id: string) {
  return queryOptions({
    queryKey: ordersQueryKeys.status(id),
    queryFn: () => ordersApi.getStatus(accessToken, id),
  })
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

export function orderDetailOptions(accessToken: string, id: string) {
  return queryOptions({
    queryKey: ordersQueryKeys.detail(id),
    queryFn: () => ordersApi.getDetail(accessToken, id),
  })
}

export function useOrderDetail(accessToken: string, id: string | null) {
  return useQuery({
    ...(id
      ? orderDetailOptions(accessToken, id)
      : {
          queryKey: ['orders', 'detail', 'none'] as const,
          queryFn: () => Promise.reject(new Error('Order ID is required')),
        }),
    enabled: id !== null,
  })
}
