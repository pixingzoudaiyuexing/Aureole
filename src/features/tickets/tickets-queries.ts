import { queryOptions, useQuery } from '@tanstack/react-query'
import { ticketIdSchema, ticketsApi } from './tickets-api'

export const ticketsQueryKeys = {
  list: ['tickets'] as const,
  detail: (id: string) => ['tickets', 'detail', id] as const,
}

export function ticketsListOptions(accessToken: string) {
  return queryOptions({
    queryKey: ticketsQueryKeys.list,
    queryFn: () => ticketsApi.getList(accessToken),
  })
}

export function useTickets(accessToken: string) {
  return useQuery(ticketsListOptions(accessToken))
}

export function ticketDetailOptions(accessToken: string, id: string) {
  return queryOptions({
    queryKey: ticketsQueryKeys.detail(id),
    queryFn: () => ticketsApi.getDetail(accessToken, id),
  })
}

export function useTicketDetail(accessToken: string, id: string | null) {
  const validId = id !== null && ticketIdSchema.safeParse(id).success
  return useQuery({
    ...(id
      ? ticketDetailOptions(accessToken, id)
      : {
          queryKey: ['tickets', 'detail', 'none'] as const,
          queryFn: () => Promise.reject(new Error('Ticket ID is required')),
        }),
    enabled: validId,
  })
}
