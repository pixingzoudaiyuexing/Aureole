import { describe, expect, it, vi } from 'vitest'
import {
  parseOnboardingConfig,
  publicAccountApi,
} from '@/features/auth/public-account-api'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const disabledOnboarding = {
  termsUrl: null,
  emailVerificationRequired: false,
  inviteCodeRequired: false,
  emailSuffixWhitelist: null,
  antiBot: {
    enabled: false,
    provider: null,
    mode: null,
    siteKey: null,
  },
}

describe('Public account API', () => {
  it('parses disabled AntiBot and strips additive onboarding fields', () => {
    expect(
      parseOnboardingConfig({
        ...disabledOnboarding,
        futureUnknownField: 'ignored',
        antiBot: {
          ...disabledOnboarding.antiBot,
          futureAntiBotField: 'ignored',
        },
      }),
    ).toEqual({
      termsUrl: null,
      emailVerificationRequired: false,
      inviteCodeRequired: false,
      emailSuffixWhitelist: null,
      antiBot: { state: 'disabled' },
    })
  })

  it('parses the supported reCAPTCHA v2 checkbox capability', () => {
    expect(
      parseOnboardingConfig({
        termsUrl: 'https://legal.example/terms',
        emailVerificationRequired: true,
        inviteCodeRequired: true,
        emailSuffixWhitelist: ['@example.com', 'mail.example'],
        antiBot: {
          enabled: true,
          provider: 'recaptcha',
          mode: 'v2-checkbox',
          siteKey: 'public-site-key',
        },
      }),
    ).toEqual({
      termsUrl: 'https://legal.example/terms',
      emailVerificationRequired: true,
      inviteCodeRequired: true,
      emailSuffixWhitelist: ['@example.com', 'mail.example'],
      antiBot: {
        state: 'supported',
        provider: 'recaptcha',
        mode: 'v2-checkbox',
        siteKey: 'public-site-key',
      },
    })
  })

  it.each([
    ['future-provider', 'v2-checkbox'],
    ['recaptcha', 'future-mode'],
  ])('classifies enabled %s/%s as unsupported', (provider, mode) => {
    expect(
      parseOnboardingConfig({
        ...disabledOnboarding,
        antiBot: { enabled: true, provider, mode, siteKey: null },
      }).antiBot,
    ).toEqual({ state: 'unsupported', provider, mode })
  })

  it.each([
    {
      ...disabledOnboarding,
      antiBot: {
        enabled: false,
        provider: 'recaptcha',
        mode: null,
        siteKey: null,
      },
    },
    {
      ...disabledOnboarding,
      antiBot: {
        enabled: true,
        provider: 'recaptcha',
        mode: 'v2-checkbox',
        siteKey: null,
      },
    },
    { ...disabledOnboarding, emailVerificationRequired: 'yes' },
    { ...disabledOnboarding, emailSuffixWhitelist: ['   '] },
    { ...disabledOnboarding, termsUrl: 'javascript:alert(1)' },
  ])('rejects malformed known onboarding fields', (payload) => {
    expect(() => parseOnboardingConfig(payload)).toThrowError(
      expect.objectContaining({ code: 'MALFORMED_RESPONSE' }),
    )
  })

  it.each([
    ['register', undefined],
    ['password-reset', 'challenge-token'],
  ] as const)(
    'sends the fixed %s email-code purpose with the correct challenge boundary',
    async (purpose, challengeToken) => {
      const request = vi.spyOn(apiClient, 'request').mockResolvedValue({
        sent: true,
        futureUnknownField: 'ignored',
      })

      await expect(
        publicAccountApi.sendEmailCode({
          email: ' member@example.com ',
          purpose,
          ...(challengeToken ? { challengeToken } : {}),
        }),
      ).resolves.toEqual({ sent: true })
      expect(request).toHaveBeenCalledWith('/api/v1/auth/email-code', {
        method: 'POST',
        body: {
          email: 'member@example.com',
          purpose,
          ...(challengeToken ? { challengeToken } : {}),
        },
      })
    },
  )

  it('strips additive Register response fields', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      accessToken: 'opaque-token',
      tokenType: 'Bearer',
      futureUnknownField: 'ignored',
    })

    await expect(
      publicAccountApi.register({
        email: 'member@example.com',
        password: 'password123',
      }),
    ).resolves.toEqual({ accessToken: 'opaque-token', tokenType: 'Bearer' })
  })

  it('sends an exact Password Reset payload without challengeToken', async () => {
    const request = vi.spyOn(apiClient, 'request').mockResolvedValue({
      reset: true,
      futureUnknownField: 'ignored',
    })

    await expect(
      publicAccountApi.resetPassword({
        email: ' member@example.com ',
        emailCode: '123456',
        newPassword: 'new-password123',
      }),
    ).resolves.toEqual({ reset: true })
    expect(request).toHaveBeenCalledWith('/api/v1/auth/password/reset', {
      method: 'POST',
      body: {
        email: 'member@example.com',
        emailCode: '123456',
        newPassword: 'new-password123',
      },
    })
    expect(request.mock.calls[0]?.[1]?.body).not.toHaveProperty(
      'challengeToken',
    )
  })

  it.each([
    ['email-code', { sent: false }],
    ['register', { accessToken: '', tokenType: 'Bearer' }],
    ['password-reset', { reset: false }],
  ])('rejects invalid known %s response fields', async (operation, payload) => {
    vi.spyOn(apiClient, 'request').mockResolvedValue(payload)

    const action =
      operation === 'email-code'
        ? publicAccountApi.sendEmailCode({
            email: 'member@example.com',
            purpose: 'register',
          })
        : operation === 'register'
          ? publicAccountApi.register({
              email: 'member@example.com',
              password: 'password123',
            })
          : publicAccountApi.resetPassword({
              email: 'member@example.com',
              emailCode: '123456',
              newPassword: 'new-password123',
            })

    await expect(action).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })
})
