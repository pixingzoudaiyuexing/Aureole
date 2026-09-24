import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api/client'
import {
  parsePromotionUi,
  promotionUiApi,
} from '@/features/orders/promotion-ui-api'
import { promotionUiQueryKey } from '@/features/orders/promotion-ui-queries'
import { ApiError } from '@/lib/api/errors'

describe('Promotion UI public config', () => {
  it('reads the anonymous exact route and strips additive fields', async () => {
    const request = vi.spyOn(apiClient, 'request').mockResolvedValue({
      showCouponEntry: true,
      annualPrefillCode: 'PUBLIC-YEAR',
      registryMetadata: 'discard',
    })
    await expect(promotionUiApi.getConfig()).resolves.toEqual({
      showCouponEntry: true,
      annualPrefillCode: 'PUBLIC-YEAR',
    })
    expect(request).toHaveBeenCalledWith('/api/v1/config/promotion-ui', {
      method: 'GET',
    })
    request.mockRestore()
  })

  it.each([
    { showCouponEntry: 'true', annualPrefillCode: null },
    { showCouponEntry: true },
    { showCouponEntry: false, annualPrefillCode: 'STALE' },
    { showCouponEntry: true, annualPrefillCode: 'A B' },
    { showCouponEntry: true, annualPrefillCode: '<script>' },
    { showCouponEntry: true, annualPrefillCode: 'A'.repeat(256) },
  ])('rejects malformed public config: %j', (payload) => {
    expect(() => parsePromotionUi(payload)).toThrowError(
      expect.objectContaining({ code: 'MALFORMED_RESPONSE' }),
    )
  })

  it('accepts explicit disabled and default configurations', () => {
    expect(
      parsePromotionUi({ showCouponEntry: false, annualPrefillCode: null }),
    ).toEqual({ showCouponEntry: false, annualPrefillCode: null })
    expect(
      parsePromotionUi({ showCouponEntry: true, annualPrefillCode: null }),
    ).toEqual({ showCouponEntry: true, annualPrefillCode: null })
  })

  it.each(['PROMOTION_UI_UNAVAILABLE', 'NETWORK_ERROR', 'MALFORMED_RESPONSE'])(
    'preserves %s as a failed read for the consumer fallback',
    async (code) => {
      const error = new ApiError({ status: 503, code, message: 'unavailable' })
      const request = vi.spyOn(apiClient, 'request').mockRejectedValue(error)
      await expect(promotionUiApi.getConfig()).rejects.toBe(error)
      request.mockRestore()
    },
  )

  it('uses a credential-free query key', () => {
    expect(promotionUiQueryKey).toEqual(['promotion-ui'])
  })
})
