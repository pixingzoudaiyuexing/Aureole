import { describe, expect, it, vi } from 'vitest'
import { downloadsApi } from '@/features/downloads/downloads-api'
import { apiClient } from '@/lib/api/client'

const item = {
  id: 'windows-x64',
  label: 'Windows',
  platform: 'windows' as const,
  arch: 'x64',
  version: '1.2.3',
  publishedAt: '2026-09-25T00:00:00.000Z',
  filename: 'client-windows-x64.exe',
  sizeBytes: 42_000_000,
  downloads: [
    {
      id: 'primary',
      label: '高速下载',
      url: 'https://downloads.example.com/client.exe',
    },
    {
      id: 'backup',
      label: '备用下载',
      url: 'https://backup.example.com/client.exe',
    },
  ],
}

describe('Downloads API', () => {
  it('uses the anonymous boundary and preserves exactly ordered actions', async () => {
    const authenticatedRequest = vi.spyOn(apiClient, 'authenticatedRequest')
    const request = vi.spyOn(apiClient, 'request').mockResolvedValue({
      items: [{ ...item, arch: null, publishedAt: null, extra: true }],
      extra: true,
    })

    await expect(downloadsApi.getDownloads()).resolves.toEqual({
      items: [{ ...item, arch: null, publishedAt: null }],
    })
    expect(request).toHaveBeenCalledWith('/api/v1/downloads', {
      method: 'GET',
    })
    expect(authenticatedRequest).not.toHaveBeenCalled()
  })

  it('strips additive fields without synthesizing compatibility fields', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({
      items: [
        {
          ...item,
          downloadUrl: 'https://downloads.example.com/legacy.exe',
          mirrors: [],
          downloads: item.downloads.map((download) => ({
            ...download,
            provider: 'not-exposed',
          })),
        },
      ],
    })

    const result = await downloadsApi.getDownloads()
    expect(result.items[0]).not.toHaveProperty('downloadUrl')
    expect(result.items[0]).not.toHaveProperty('mirrors')
    expect(result.items[0]?.downloads[0]).not.toHaveProperty('provider')
    expect(result.items[0]?.downloads.map((download) => download.id)).toEqual([
      'primary',
      'backup',
    ])
  })

  it('accepts an empty response', async () => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({ items: [] })

    await expect(downloadsApi.getDownloads()).resolves.toEqual({ items: [] })
  })

  it.each([
    [{ ...item, downloads: [item.downloads[0]] }],
    [{ ...item, downloads: [...item.downloads, item.downloads[0]] }],
    [{ ...item, sizeBytes: -1 }],
    [{ ...item, platform: 'ios' }],
    [
      {
        ...item,
        downloads: [
          { ...item.downloads[0], url: 'http://downloads.example.com/a' },
          item.downloads[1],
        ],
      },
    ],
    [
      {
        ...item,
        downloads: [
          {
            ...item.downloads[0],
            url: 'https://user:password@downloads.example.com/a',
          },
          item.downloads[1],
        ],
      },
    ],
    [
      {
        ...item,
        downloads: [
          { ...item.downloads[0], url: 'https://downloads.example.com/a\n' },
          item.downloads[1],
        ],
      },
    ],
  ])('rejects malformed public DTOs as MALFORMED_RESPONSE', async (items) => {
    vi.spyOn(apiClient, 'request').mockResolvedValue({ items })

    await expect(downloadsApi.getDownloads()).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    })
  })
})
