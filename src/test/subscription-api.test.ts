import { describe, expect, it, vi } from 'vitest'
import { subscriptionApi } from '@/features/subscription/subscription-api'
import {
  advanceSubscriptionPeriodMutationOptions,
  rotateSubscriptionAccessMutationOptions,
  subscriptionMutationKeys,
  subscriptionQueryKeys,
} from '@/features/subscription/subscription-queries'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const accessToken = 'opaque-session-token'
const credentialUrl =
  'https://gateway.example/api/v1/access/subscription?token=opaque-token'

const validOverview = {
  product: { id: '7', name: 'Pro Plan' },
  expiresAt: '2030-01-01T00:00:00.000Z',
  traffic: {
    uploadedBytes: 123,
    downloadedBytes: 456,
    allowanceBytes: 107_374_182_400,
  },
  deviceLimit: 3,
  activeDevices: 1,
  resetDay: 15,
  renewalAllowed: true,
}

describe('Subscription API contract', () => {
  it('reads ordered delivery options and validates the declared default', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        defaultEntryId: 'primary',
        entries: [
          { id: 'primary', label: 'Subscription', private: true },
          { id: 'backup', label: 'Backup' },
        ],
        registry: 'stripped',
      })

    await expect(
      subscriptionApi.getDeliveryOptions(accessToken),
    ).resolves.toEqual({
      defaultEntryId: 'primary',
      entries: [
        { id: 'primary', label: 'Subscription' },
        { id: 'backup', label: 'Backup' },
      ],
    })
    expect(request).toHaveBeenCalledWith(
      '/api/v1/subscription/delivery-options',
      { method: 'GET', accessToken, signal: undefined },
    )
  })

  it.each([
    { defaultEntryId: 'missing', entries: [{ id: 'primary', label: 'One' }] },
    { defaultEntryId: null, entries: [{ id: 'Bad_ID', label: 'One' }] },
    { defaultEntryId: null, entries: [{ id: 'primary', label: '' }] },
    {
      defaultEntryId: 'primary',
      entries: [
        { id: 'primary', label: 'One' },
        { id: 'primary', label: 'Duplicate' },
      ],
    },
  ])('rejects malformed delivery options %#', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(
      subscriptionApi.getDeliveryOptions(accessToken),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it('requests the exact default profile access link and keeps it opaque', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({ accessUrl: credentialUrl, token: 'stripped' })

    await expect(
      subscriptionApi.getAccessLink(accessToken, {
        entryId: 'primary',
        profileId: 'default',
        subscriptionInfo: 'show',
      }),
    ).resolves.toEqual({ accessUrl: credentialUrl })
    expect(request).toHaveBeenCalledWith('/api/v1/subscription/access-link', {
      method: 'POST',
      accessToken,
      body: {
        entryId: 'primary',
        profileId: 'default',
        subscriptionInfo: 'show',
      },
      signal: undefined,
    })
  })

  it.each([
    { entryId: 'Bad_ID', profileId: 'default', subscriptionInfo: 'show' },
    { entryId: 'primary', profileId: 'enhanced', subscriptionInfo: 'show' },
    { entryId: 'primary', profileId: 'default', subscriptionInfo: 'other' },
    {
      entryId: 'primary',
      profileId: 'default',
      subscriptionInfo: 'show',
      extra: true,
    },
  ])('rejects an invalid access-link request %#', async (input) => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')
    await expect(
      subscriptionApi.getAccessLink(accessToken, input as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    {},
    { accessUrl: null },
    { accessUrl: 'http://subscription.example/TOKEN' },
    { accessUrl: 'https://user:pass@subscription.example/TOKEN' },
    { accessUrl: 'javascript:alert(1)' },
    { accessUrl: ` ${credentialUrl}` },
  ])('rejects malformed access-link data %#', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(
      subscriptionApi.getAccessLink(accessToken, {
        entryId: 'primary',
        profileId: 'default',
        subscriptionInfo: 'show',
      }),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it('reads entries in server order and strips additive fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        entries: [
          { baseUrl: 'https://a.example.com', label: 'ignored' },
          { baseUrl: 'https://b.example.com/path', future: true },
        ],
        futureField: 'ignored',
      })

    await expect(subscriptionApi.getEntries(accessToken)).resolves.toEqual({
      entries: [
        { baseUrl: 'https://a.example.com' },
        { baseUrl: 'https://b.example.com/path' },
      ],
    })
    expect(request).toHaveBeenCalledWith('/api/v1/subscription/entries', {
      method: 'GET',
      accessToken,
      signal: undefined,
    })
  })

  it('posts the exact selected baseUrl and keeps the access URL opaque', async () => {
    const selectedBaseUrl = 'https://b.example.com/path/'
    const selectedAccessUrl =
      'https://b.example.com/path/api/v1/client/subscribe?token=dummy-token'
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({ accessUrl: selectedAccessUrl, token: 'stripped' })

    await expect(
      subscriptionApi.getEntryAccess(accessToken, selectedBaseUrl),
    ).resolves.toEqual({ accessUrl: selectedAccessUrl })
    expect(request).toHaveBeenCalledWith('/api/v1/subscription/entry-access', {
      method: 'POST',
      accessToken,
      body: { baseUrl: selectedBaseUrl },
      signal: undefined,
    })
  })

  it.each([
    { entries: [{ baseUrl: '' }] },
    { entries: [{ baseUrl: ' '.repeat(2) }] },
    { entries: [{ baseUrl: 'x'.repeat(2049) }] },
    { entries: [{ baseUrl: null }] },
    { entries: 'not-an-array' },
  ])('rejects malformed entries data', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(subscriptionApi.getEntries(accessToken)).rejects.toMatchObject(
      {
        code: 'MALFORMED_RESPONSE',
      } satisfies Partial<ApiError>,
    )
  })

  it.each([
    {},
    { accessUrl: null },
    { accessUrl: 'http://entry.example/subscription' },
    { accessUrl: 'https://user:password@entry.example/subscription' },
    { accessUrl: 'not-a-url' },
  ])('rejects malformed entry-access data', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(
      subscriptionApi.getEntryAccess(accessToken, 'https://entry.example'),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each(['', '   ', 'x'.repeat(2049)])(
    'rejects invalid entry-access input before the request',
    async (baseUrl) => {
      const request = vi.spyOn(apiClient, 'authenticatedRequest')
      await expect(
        subscriptionApi.getEntryAccess(accessToken, baseUrl),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
      expect(request).not.toHaveBeenCalled()
    },
  )

  it('reads an unavailable access state and strips additive fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        eligible: false,
        accessUrl: null,
        futureField: 'ignored',
      })

    await expect(subscriptionApi.getAccess(accessToken)).resolves.toEqual({
      eligible: false,
      accessUrl: null,
    })
    expect(request).toHaveBeenCalledWith('/api/v1/subscription', {
      method: 'GET',
      accessToken,
    })
  })

  it('reads an eligible HTTPS credential without rewriting it', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      eligible: true,
      accessUrl: credentialUrl,
      futureField: 'ignored',
    })

    await expect(subscriptionApi.getAccess(accessToken)).resolves.toEqual({
      eligible: true,
      accessUrl: credentialUrl,
    })
  })

  it('rotates access with an exact bodyless POST and strips additive fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        rotated: true,
        accessUrl: credentialUrl,
        token: 'must-be-stripped',
      })

    await expect(subscriptionApi.rotateAccess(accessToken)).resolves.toEqual({
      rotated: true,
      accessUrl: credentialUrl,
    })
    expect(request).toHaveBeenCalledWith('/api/v1/subscription/rotate-access', {
      method: 'POST',
      accessToken,
    })
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty('body')
  })

  it.each([
    { rotated: false, accessUrl: credentialUrl },
    { accessUrl: credentialUrl },
    { rotated: true },
    { rotated: true, accessUrl: 'http://gateway.example/subscription' },
    {
      rotated: true,
      accessUrl: 'https://user:password@gateway.example/subscription',
    },
    { rotated: true, accessUrl: 'not-a-url' },
  ])('rejects malformed rotation data', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)

    await expect(
      subscriptionApi.rotateAccess(accessToken),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it('advances a period with an exact bodyless POST and strips additive fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        advanced: true,
        newExpiresAt: 'must-be-stripped',
        newTraffic: 'must-be-stripped',
      })

    await expect(subscriptionApi.advancePeriod(accessToken)).resolves.toEqual({
      advanced: true,
    })
    expect(request).toHaveBeenCalledWith(
      '/api/v1/subscription/advance-period',
      { method: 'POST', accessToken },
    )
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty('body')
  })

  it.each([
    { advanced: false },
    {},
    { advanced: 'true' },
    { newExpiresAt: '2030-01-01T00:00:00.000Z' },
  ])('rejects malformed period advance data', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)

    await expect(
      subscriptionApi.advancePeriod(accessToken),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it('keeps subscription query and mutation keys credential-free', () => {
    const rotationMutation =
      rotateSubscriptionAccessMutationOptions(accessToken)
    const advanceMutation =
      advanceSubscriptionPeriodMutationOptions(accessToken)
    expect(subscriptionQueryKeys.deliveryOptions).toEqual([
      'subscription',
      'delivery-options',
    ])
    expect(subscriptionMutationKeys.rotateAccess).toEqual([
      'subscription',
      'rotate-access',
    ])
    expect(subscriptionMutationKeys.advancePeriod).toEqual([
      'subscription',
      'advance-period',
    ])
    expect(rotationMutation.mutationKey).not.toContain(accessToken)
    expect(advanceMutation.mutationKey).not.toContain(accessToken)
    expect(rotationMutation.retry).toBe(false)
    expect(advanceMutation.retry).toBe(false)
    expect(JSON.stringify(subscriptionQueryKeys)).not.toContain(accessToken)
    expect(JSON.stringify(subscriptionQueryKeys)).not.toContain(credentialUrl)
  })

  it('discards the legacy rotate credential before MutationCache ownership', async () => {
    vi.spyOn(subscriptionApi, 'rotateAccess').mockResolvedValue({
      rotated: true,
      accessUrl: credentialUrl,
    })

    await expect(
      rotateSubscriptionAccessMutationOptions(accessToken).mutationFn(),
    ).resolves.toEqual({ rotated: true })
  })

  it.each([
    { eligible: false, accessUrl: credentialUrl },
    { eligible: true, accessUrl: null },
    { eligible: true, accessUrl: 'http://gateway.example/subscription' },
    {
      eligible: true,
      accessUrl: 'https://user:password@gateway.example/subscription',
    },
    { eligible: true, accessUrl: 'javascript:alert(1)' },
    { eligible: true, accessUrl: 'data:text/plain,credential' },
    { eligible: true, accessUrl: 'file:///tmp/subscription' },
    { eligible: true, accessUrl: ` ${credentialUrl}` },
  ])('rejects malformed access data', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)

    await expect(subscriptionApi.getAccess(accessToken)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it('reads a complete overview and strips nested additive fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        ...validOverview,
        product: { ...validOverview.product, futureProductField: true },
        traffic: { ...validOverview.traffic, futureTrafficField: true },
        futureField: 'ignored',
      })

    await expect(subscriptionApi.getOverview(accessToken)).resolves.toEqual(
      validOverview,
    )
    expect(request).toHaveBeenCalledWith('/api/v1/subscription/overview', {
      method: 'GET',
      accessToken,
    })
  })

  it('preserves valid null and zero overview values', async () => {
    const payload = {
      product: null,
      expiresAt: null,
      traffic: {
        uploadedBytes: 0,
        downloadedBytes: 0,
        allowanceBytes: 0,
      },
      deviceLimit: null,
      activeDevices: 0,
      resetDay: null,
      renewalAllowed: false,
    }
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)

    await expect(subscriptionApi.getOverview(accessToken)).resolves.toEqual(
      payload,
    )
  })

  it.each([
    { ...validOverview, expiresAt: 'not-a-timestamp' },
    { ...validOverview, product: { id: '0', name: 'Invalid' } },
    { ...validOverview, product: { id: '2147483648', name: 'Invalid' } },
    { ...validOverview, product: { id: '7', name: '' } },
    {
      ...validOverview,
      traffic: { ...validOverview.traffic, uploadedBytes: -1 },
    },
    {
      ...validOverview,
      traffic: { ...validOverview.traffic, downloadedBytes: 1.5 },
    },
    {
      ...validOverview,
      traffic: {
        ...validOverview.traffic,
        allowanceBytes: Number.MAX_SAFE_INTEGER + 1,
      },
    },
    { ...validOverview, activeDevices: -1 },
    { ...validOverview, activeDevices: 1.5 },
    { ...validOverview, deviceLimit: -1 },
    { ...validOverview, resetDay: 1.5 },
    { ...validOverview, renewalAllowed: 1 },
  ])('rejects malformed known overview fields', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)

    await expect(
      subscriptionApi.getOverview(accessToken),
    ).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })
})
