import { queryOptions, useQuery } from '@tanstack/react-query'
import type { CreateTicketInput } from './tickets-api'
import { ticketIdSchema, ticketsApi } from './tickets-api'

export const ticketsQueryKeys = {
  list: ['tickets'] as const,
  detail: (id: string) => ['tickets', 'detail', id] as const,
}

export const ticketsMutationKeys = {
  create: ['tickets', 'create'] as const,
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

export function ticketCreateMutationOptions(accessToken: string) {
  return {
    mutationKey: ticketsMutationKeys.create,
    mutationFn: (input: CreateTicketInput) =>
      ticketsApi.create(accessToken, input),
    retry: false as const,
  }
}
