import { useQuery } from '@tanstack/react-query'
import { promotionUiApi } from './promotion-ui-api'

export const promotionUiQueryKey = ['promotion-ui'] as const

export function usePromotionUi() {
  return useQuery({
    queryKey: promotionUiQueryKey,
    queryFn: promotionUiApi.getConfig,
    retry: false,
  })
}
