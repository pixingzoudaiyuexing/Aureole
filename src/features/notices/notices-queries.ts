import { queryOptions, useQuery } from '@tanstack/react-query'
import { noticesApi } from './notices-api'

export const noticesQueryKeys = {
  list: (page: number, pageSize: number) =>
    ['notices', 'list', page, pageSize] as const,
  detail: (id: string) => ['notices', 'detail', id] as const,
}
export function noticeListOptions(
  token: string,
  page: number,
  pageSize: number,
) {
  return queryOptions({
    queryKey: noticesQueryKeys.list(page, pageSize),
    queryFn: () => noticesApi.getList(token, page, pageSize),
  })
}
export function useNoticeList(token: string, page: number, pageSize: number) {
  return useQuery(noticeListOptions(token, page, pageSize))
}
export function useNoticeDetail(token: string, id: string | null) {
  return useQuery({
    queryKey: id ? noticesQueryKeys.detail(id) : ['notices', 'detail', 'none'],
    queryFn: () => noticesApi.getDetail(token, id!),
    enabled: id !== null,
  })
}
