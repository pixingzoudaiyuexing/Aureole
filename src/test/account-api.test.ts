import { describe, expect, it, vi } from 'vitest'
import { accountApi } from '@/features/account/account-api'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const accessToken = 'opaque-account-token'

describe('Account API contract', () => {
  it('reads preferences and strips additive response fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        autoRenewal: true,
        remindExpire: false,
        remindTraffic: true,
        futureField: 'ignored',
      })

    await expect(accountApi.getPreferences(accessToken)).resolves.toEqual({
      autoRenewal: true,
      remindExpire: false,
      remindTraffic: true,
    })
    expect(request).toHaveBeenCalledWith('/api/v1/me/preferences', {
      method: 'GET',
      accessToken,
    })
  })

  it('sends only supplied preference fields and strips additive response fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        updated: true,
        futureField: 'ignored',
      })

    await expect(
      accountApi.updatePreferences(accessToken, { remindTraffic: false }),
    ).resolves.toEqual({ updated: true })
    expect(request).toHaveBeenCalledWith('/api/v1/me/preferences', {
      method: 'PATCH',
      body: { remindTraffic: false },
      accessToken,
    })
  })

  it('rejects empty and unknown preference update fields before the API call', async () => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')

    await expect(
      accountApi.updatePreferences(accessToken, {}),
    ).rejects.toBeDefined()
    await expect(
      accountApi.updatePreferences(accessToken, {
        remindExpire: true,
        futureField: true,
      } as Parameters<typeof accountApi.updatePreferences>[1]),
    ).rejects.toBeDefined()
    expect(request).not.toHaveBeenCalled()
  })

  it('reads non-negative integer stats including zero', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        pendingOrders: 0,
        openTickets: 2,
        invitedUsers: 5,
        futureField: 'ignored',
      })

    await expect(accountApi.getStats(accessToken)).resolves.toEqual({
      pendingOrders: 0,
      openTickets: 2,
      invitedUsers: 5,
    })
    expect(request).toHaveBeenCalledWith('/api/v1/me/stats', {
      method: 'GET',
      accessToken,
    })
  })

  it.each([
    { pendingOrders: -1, openTickets: 0, invitedUsers: 0 },
    { pendingOrders: 1.5, openTickets: 0, invitedUsers: 0 },
    { pendingOrders: 1, openTickets: '0', invitedUsers: 0 },
  ])('rejects malformed known stats fields', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)

    await expect(accountApi.getStats(accessToken)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it('reads bounded account currency strings without money assumptions', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        currency: ' CNY ',
        currencySymbol: ' ¥ ',
        futureField: 'ignored',
      })

    await expect(accountApi.getConfig(accessToken)).resolves.toEqual({
      currency: 'CNY',
      currencySymbol: '¥',
    })
    expect(request).toHaveBeenCalledWith('/api/v1/config/account', {
      method: 'GET',
      accessToken,
    })
  })

  it.each([
    { currency: '', currencySymbol: '¥' },
    { currency: 'CNY', currencySymbol: '' },
    { currency: 'A'.repeat(17), currencySymbol: '$' },
  ])('rejects malformed known account config fields', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)

    await expect(accountApi.getConfig(accessToken)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([65, 1024])(
    'accepts a %i-character new password and sends the exact payload',
    async (length) => {
      const request = vi
        .spyOn(apiClient, 'authenticatedRequest')
        .mockResolvedValue({
          changed: true,
          futureField: 'ignored',
        })
      const newPassword = 'n'.repeat(length)

      await expect(
        accountApi.changePassword(accessToken, {
          currentPassword: 'current-password',
          newPassword,
        }),
      ).resolves.toEqual({ changed: true })
      expect(request).toHaveBeenCalledWith('/api/v1/me/password', {
        method: 'POST',
        body: { currentPassword: 'current-password', newPassword },
        accessToken,
      })
    },
  )

  it.each([
    ['', 'new-password'],
    ['c'.repeat(1025), 'new-password'],
    ['current-password', 'short'],
    ['current-password', 'n'.repeat(1025)],
  ])(
    'rejects invalid password boundaries before the API call',
    async (currentPassword, newPassword) => {
      const request = vi.spyOn(apiClient, 'authenticatedRequest')

      await expect(
        accountApi.changePassword(accessToken, {
          currentPassword,
          newPassword,
        }),
      ).rejects.toBeDefined()
      expect(request).not.toHaveBeenCalled()
    },
  )

  it('rejects unknown password request fields before the API call', async () => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')

    await expect(
      accountApi.changePassword(accessToken, {
        currentPassword: 'current-password',
        newPassword: 'new-password',
        confirmNewPassword: 'new-password',
      } as Parameters<typeof accountApi.changePassword>[1]),
    ).rejects.toBeDefined()
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    [
      'preferences',
      { autoRenewal: 1, remindExpire: false, remindTraffic: true },
    ],
    ['preferences-update', { updated: false }],
    ['password', { changed: false }],
  ])('rejects invalid known %s response fields', async (operation, payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)

    const action =
      operation === 'preferences'
        ? accountApi.getPreferences(accessToken)
        : operation === 'preferences-update'
          ? accountApi.updatePreferences(accessToken, { remindExpire: true })
          : accountApi.changePassword(accessToken, {
              currentPassword: 'current-password',
              newPassword: 'new-password',
            })

    await expect(action).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })
})
