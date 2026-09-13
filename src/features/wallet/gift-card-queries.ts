import { giftCardApi } from './gift-card-api'

export const giftCardMutationKeys = {
  redeem: ['gift-cards', 'redeem'] as const,
}

export function giftCardRedeemMutationOptions(accessToken: string) {
  return {
    mutationKey: giftCardMutationKeys.redeem,
    mutationFn: (code: string) => giftCardApi.redeem(accessToken, { code }),
    retry: false as const,
  }
}
