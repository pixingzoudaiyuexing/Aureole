import { describe, expect, it, vi } from 'vitest'
import { helpApi } from '@/features/help/help-api'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const summary = {
  id: '12',
  title: '使用说明',
  category: '入门',
  updatedAt: '2026-09-26T00:00:00.000Z',
}

describe('Help API', () => {
  it('uses authenticated categories and strips additive fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        categories: [{ name: '入门', articleCount: 2, raw: 'ignored' }],
        raw: true,
      })
    await expect(helpApi.getCategories('session')).resolves.toEqual({
      categories: [{ name: '入门', articleCount: 2 }],
    })
    expect(request).toHaveBeenCalledWith('/api/v1/help/categories', {
      method: 'GET',
      accessToken: 'session',
    })
  })

  it('builds an encoded category plus keyword request with page size 20', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        items: [{ ...summary, raw: true }],
        page: 2,
        pageSize: 20,
        total: 21,
      })
    await expect(
      helpApi.getArticles('session', {
        category: '常见 问题',
        q: 'Clash & 下载',
        page: 2,
      }),
    ).resolves.toEqual({ items: [summary], page: 2, pageSize: 20, total: 21 })
    const path = request.mock.calls[0]?.[0]
    expect(path?.split('?')[0]).toBe('/api/v1/help/articles')
    expect(
      Object.fromEntries(new URLSearchParams(path?.split('?')[1])),
    ).toEqual({
      category: '常见 问题',
      q: 'Clash & 下载',
      page: '2',
      pageSize: '20',
    })
    expect(request.mock.calls[0]?.[1]).toEqual({
      method: 'GET',
      accessToken: 'session',
    })
  })

  it('supports empty results and omits empty search terms', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 })
    await expect(
      helpApi.getArticles('session', { page: 1 }),
    ).resolves.toMatchObject({ items: [], total: 0 })
    expect(request.mock.calls[0]?.[0]).not.toContain('q=')
  })

  it('projects typed detail and skips only unknown top-level blocks', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      article: {
        ...summary,
        extra: 'ignored',
        blocks: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Safe', html: '<script>' }],
          },
          { type: 'future-block', html: '<script>' },
        ],
      },
    })
    await expect(helpApi.getArticle('session', '12')).resolves.toEqual({
      ...summary,
      blocks: [
        { type: 'paragraph', children: [{ type: 'text', text: 'Safe' }] },
      ],
    })
  })

  it.each([
    [{ categories: [{ name: 'A', articleCount: -1 }] }, 'categories'],
    [
      { items: [{ ...summary, id: 'bad' }], page: 1, pageSize: 20, total: 1 },
      'articles',
    ],
    [
      {
        article: {
          ...summary,
          blocks: [
            {
              type: 'paragraph',
              children: [{ type: 'link', href: 'https://example.com' }],
            },
          ],
        },
      },
      'detail',
    ],
    [{ article: { ...summary, rawBody: 'private', blocks: [] } }, 'detail'],
  ] as const)('fails closed on malformed %s data', async (data, target) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(data)
    const call =
      target === 'categories'
        ? helpApi.getCategories('session')
        : target === 'articles'
          ? helpApi.getArticles('session', { page: 1 })
          : helpApi.getArticle('session', '12')
    await expect(call).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' })
  })

  it('preserves public 404, 503 and network failures', async () => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')
    for (const error of [
      new ApiError({
        status: 404,
        code: 'HELP_ARTICLE_NOT_FOUND',
        message: 'Missing',
      }),
      new ApiError({
        status: 503,
        code: 'HELP_UNAVAILABLE',
        message: 'Unavailable',
      }),
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network' }),
    ]) {
      request.mockRejectedValueOnce(error)
      await expect(helpApi.getArticle('session', '12')).rejects.toBe(error)
    }
  })
})
