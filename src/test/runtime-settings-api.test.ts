import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  parseRuntimeSettings,
  runtimeSettingsApi,
} from '@/features/runtime-settings/runtime-settings-api'
import { runtimeSettingsQueryKey } from '@/features/runtime-settings/runtime-settings-queries'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const allNullSettings = {
  siteName: null,
  brandName: null,
  title: null,
  description: null,
  logoUrl: null,
  faviconUrl: null,
  footerText: null,
  crispWebsiteId: null,
}

const validSettings = {
  siteName: 'Aureole Services',
  brandName: 'Aureole Plus',
  title: 'Aureole Plus',
  description: 'Managed access for members.',
  logoUrl: 'https://assets.example.com/logo.png',
  faviconUrl: 'https://assets.example.com/favicon.ico',
  footerText: 'Aureole Services',
  crispWebsiteId: null,
}

describe('Runtime Settings API contract', () => {
  beforeEach(() => {
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockRestore()
  })

  it('uses the anonymous request boundary without an Authorization option', async () => {
    const request = vi
      .spyOn(apiClient, 'request')
      .mockResolvedValue(validSettings)

    await expect(runtimeSettingsApi.getRuntimeSettings()).resolves.toEqual(
      validSettings,
    )
    expect(request).toHaveBeenCalledWith('/api/v1/config/runtime', {
      method: 'GET',
    })
    expect(request.mock.calls[0]?.[1]).not.toHaveProperty('headers')
    expect(JSON.stringify(request.mock.calls[0])).not.toContain('Authorization')
  })

  it('accepts the nullable Crisp ID and rejects invalid values', () => {
    expect(parseRuntimeSettings(allNullSettings)).toEqual(allNullSettings)
    const websiteId = 'f2f29d4a-625e-4613-bd18-6ae788aac471'
    expect(
      parseRuntimeSettings({ ...validSettings, crispWebsiteId: websiteId }),
    ).toMatchObject({ crispWebsiteId: websiteId })
    for (const crispWebsiteId of [undefined, 'not-a-uuid', 123]) {
      expect(() =>
        parseRuntimeSettings({ ...validSettings, crispWebsiteId }),
      ).toThrowError(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }))
    }
  })

  it('strips additive fields without exposing Registry metadata', () => {
    expect(
      parseRuntimeSettings({
        ...validSettings,
        registryModule: 'runtime-settings',
        freshness: 'stale',
        sourceMetadata: { key: 'private' },
      }),
    ).toEqual(validSettings)
  })

  it.each([
    ['missing siteName', { ...allNullSettings, siteName: undefined }],
    ['numeric brandName', { ...allNullSettings, brandName: 123 }],
    ['boolean title', { ...allNullSettings, title: true }],
    ['object description', { ...allNullSettings, description: {} }],
    ['array footerText', { ...allNullSettings, footerText: [] }],
  ])('fails closed for a %s', (_case, payload) => {
    expect(() => parseRuntimeSettings(payload)).toThrowError(
      expect.objectContaining({
        code: 'MALFORMED_RESPONSE',
      } satisfies Partial<ApiError>),
    )
  })

  it.each([
    'http://assets.example.com/logo.png',
    'javascript:alert(1)',
    'data:image/png;base64,test',
    'file:///tmp/logo.png',
    'blob:https://assets.example.com/logo',
    '/logo.png',
    '//assets.example.com/logo.png',
    'https://user:password@assets.example.com/logo.png',
    'https://assets.example.com/has space.png',
  ])('rejects an unsafe runtime image URL: %s', (url) => {
    expect(() =>
      parseRuntimeSettings({
        ...allNullSettings,
        logoUrl: url,
      }),
    ).toThrowError(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }))
    expect(() =>
      parseRuntimeSettings({
        ...allNullSettings,
        faviconUrl: url,
      }),
    ).toThrowError(expect.objectContaining({ code: 'MALFORMED_RESPONSE' }))
  })

  it('preserves API errors as a non-auth presentation read failure', async () => {
    const error = new ApiError({
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Unexpected anonymous response',
    })
    vi.spyOn(apiClient, 'request').mockRejectedValue(error)

    await expect(runtimeSettingsApi.getRuntimeSettings()).rejects.toBe(error)
  })

  it('uses a credential-free stable query key', () => {
    expect(runtimeSettingsQueryKey).toEqual(['runtime-settings'])
  })
})
