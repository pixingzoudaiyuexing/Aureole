import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { PanelsTopLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/app/providers/query-client'
import { buildNavigationItems } from '@/config/navigation'
import {
  customPagesApi,
  type CustomPage,
} from '@/features/custom-pages/custom-pages-api'
import {
  customPagesQueryKey,
  useCustomPages,
} from '@/features/custom-pages/custom-pages-queries'
import {
  getCustomPageById,
  getCustomPageIdFromPath,
  getIframeCustomPageById,
} from '@/features/custom-pages/custom-pages-routing'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const accessToken = 'opaque-custom-pages-token'
const validPages: CustomPage[] = [
  {
    id: 'notice-8',
    title: '外部状态',
    url: 'https://status.example.com/current',
    mode: 'external',
  },
  {
    id: 'notice-6',
    title: '使用指南',
    url: 'https://docs.example.com/guide?lang=zh#start',
    mode: 'iframe',
  },
]

describe('Custom Pages API contract', () => {
  beforeEach(() => {
    vi.mocked(customPagesApi.getList).mockRestore()
  })

  it('uses the exact authenticated GET and preserves server order and URLs', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({ items: validPages })

    await expect(customPagesApi.getList(accessToken)).resolves.toEqual({
      items: validPages,
    })
    expect(request).toHaveBeenCalledWith('/api/v1/custom-pages', {
      method: 'GET',
      accessToken,
    })
  })

  it('accepts an authoritative empty list without fallback', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({ items: [] })
    await expect(customPagesApi.getList(accessToken)).resolves.toEqual({
      items: [],
    })
  })

  it('strips additive fields without exposing Notice internals', async () => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      items: [
        {
          ...validPages[0],
          tags: ['aureole:external'],
          content: 'private source value',
          createdAt: '2026-09-17T00:00:00.000Z',
        },
      ],
      total: 1,
    })

    await expect(customPagesApi.getList(accessToken)).resolves.toEqual({
      items: [validPages[0]],
    })
  })

  it.each([
    [
      'auth failure',
      new ApiError({ status: 401, code: 'AUTH_REQUIRED', message: 'auth' }),
    ],
    [
      'network failure',
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'network' }),
    ],
    [
      'server failure',
      new ApiError({ status: 500, code: 'UPSTREAM_ERROR', message: 'server' }),
    ],
  ])(
    'preserves %s from the authenticated API boundary',
    async (_case, error) => {
      vi.spyOn(apiClient, 'authenticatedRequest').mockRejectedValue(error)
      await expect(customPagesApi.getList(accessToken)).rejects.toBe(error)
    },
  )

  it.each([
    ['malformed top-level', []],
    ['missing items', {}],
    ['malformed item', { items: [null] }],
    ['missing id', { items: [{ ...validPages[0], id: undefined }] }],
    ['missing title', { items: [{ ...validPages[0], title: undefined }] }],
    ['missing url', { items: [{ ...validPages[0], url: undefined }] }],
    ['missing mode', { items: [{ ...validPages[0], mode: undefined }] }],
    ['invalid mode', { items: [{ ...validPages[0], mode: 'popup' }] }],
    [
      'duplicate id',
      { items: [validPages[0], { ...validPages[1], id: validPages[0]!.id }] },
    ],
    ['uppercase id', { items: [{ ...validPages[0], id: 'Notice-8' }] }],
    ['blank title', { items: [{ ...validPages[0], title: '' }] }],
  ])('fails closed for %s', async (_case, payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(customPagesApi.getList(accessToken)).rejects.toMatchObject({
      status: 200,
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    'http://docs.example.com',
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///tmp/page.html',
    'blob:https://docs.example.com/id',
    '/relative/path',
    '//docs.example.com/path',
    'https://user:password@docs.example.com',
    'https://docs.example.com/has space',
  ])('rejects unsafe URL %s', async (url) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      items: [{ ...validPages[0], url }],
    })
    await expect(customPagesApi.getList(accessToken)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    })
  })

  it('does not request Custom Pages while unauthenticated', () => {
    const request = vi.spyOn(apiClient, 'authenticatedRequest')
    const queryClient = createQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useCustomPages(null), { wrapper })

    expect(result.current.fetchStatus).toBe('idle')
    expect(request).not.toHaveBeenCalled()
  })

  it('uses one credential-free shared query key', () => {
    expect(customPagesQueryKey).toEqual(['custom-pages'])
    expect(JSON.stringify(customPagesQueryKey)).not.toContain(accessToken)
  })
})

describe('Custom Pages navigation and routing helpers', () => {
  it('keeps core items, server order, default local icons, then Account', () => {
    const items = buildNavigationItems(validPages)
    expect(items.map((item) => item.label).slice(-3)).toEqual([
      '外部状态',
      '使用指南',
      'Account',
    ])

    const customItems = items.filter((item) => item.kind !== 'internal')
    expect(customItems).toHaveLength(2)
    expect(customItems.every((item) => item.icon === PanelsTopLeft)).toBe(true)
    expect(customItems[0]).toMatchObject({
      kind: 'custom-external',
      href: validPages[0]?.url,
    })
    expect(customItems[1]).toMatchObject({
      kind: 'custom-iframe',
      to: '/custom/$customPageId',
      params: { customPageId: 'notice-6' },
      path: '/custom/notice-6',
    })
  })

  it('has zero Custom Pages for an empty authoritative list', () => {
    const items = buildNavigationItems([])
    expect(items.filter((item) => item.kind !== 'internal')).toEqual([])
    expect(items.at(-1)?.label).toBe('Account')
  })

  it('looks up stable IDs and only exposes iframe entries to iframe routes', () => {
    expect(getCustomPageById('notice-8', validPages)).toEqual(validPages[0])
    expect(getIframeCustomPageById('notice-8', validPages)).toBeNull()
    expect(getIframeCustomPageById('notice-6', validPages)).toEqual(
      validPages[1],
    )
    expect(getIframeCustomPageById('notice-404', validPages)).toBeNull()
  })

  it.each([
    ['/custom/notice-6', 'notice-6'],
    ['/custom/Notice-6', null],
    ['/custom/notice--6', null],
    ['/custom/notice-6/extra', null],
    ['/dashboard', null],
  ])('parses route %s as %s', (path, expected) => {
    expect(getCustomPageIdFromPath(path)).toBe(expected)
  })
})
